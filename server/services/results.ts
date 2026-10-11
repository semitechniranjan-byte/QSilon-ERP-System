import { one, q } from '../db/pool.js';
import { PCT_SQL } from '../lib/sql.js';

export async function gradeBands(scaleId: number | null) {
  const sid = scaleId ?? (await one('SELECT id FROM grading_scales WHERE is_default ORDER BY id LIMIT 1'))?.id;
  if (!sid) return [];
  return q('SELECT min_percent, grade, grade_point, remark FROM grading_bands WHERE scale_id = $1 ORDER BY min_percent DESC', [sid]);
}
export function gradeFor(bands: any[], percent: number | null) {
  if (percent == null) return null;
  return bands.find((b) => percent >= b.min_percent) ?? null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute results for students of an exam. When onlyApproved is true (student-facing / publication), only marks
 * from approved submissions are included.
 */
export async function computeResults(examId: number, opts: { sectionId?: number | null; studentId?: number | null; onlyApproved: boolean }) {
  const exam = await one('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return null;
  const bands = await gradeBands(exam.grading_scale_id);
  const students = await q(
    `SELECT e.id AS enrollment_id, e.student_id, e.roll_no, e.section_id, e.class_level_id, st.first_name, st.last_name, st.name_hi, st.student_code, st.admission_no, st.dob,
            cl.name AS class_name, cl.name_hi AS class_name_hi, sec.name AS section_name
       FROM enrollments e JOIN students st ON st.id = e.student_id JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
      WHERE e.academic_year_id = $1 AND ($2::bigint IS NULL OR e.section_id = $2) AND ($3::bigint IS NULL OR e.student_id = $3)
      ORDER BY cl.sort_order, sec.name, e.roll_no`, [exam.academic_year_id, opts.sectionId ?? null, opts.studentId ?? null]);
  if (!students.length) return { exam, bands, students: [] as any[] };
  const subjects = await q(
    `SELECT es.*, s.name AS subject_name, s.name_hi AS subject_name_hi FROM exam_subjects es JOIN subjects s ON s.id = es.subject_id
      WHERE es.exam_id = $1 ORDER BY es.exam_date NULLS LAST, s.name`, [examId]);
  const marks = await q(
    `SELECT m.*, ms.status AS submission_status FROM marks m JOIN exam_subjects es ON es.id = m.exam_subject_id
       JOIN enrollments e ON e.id = m.enrollment_id
       LEFT JOIN mark_submissions ms ON ms.exam_subject_id = m.exam_subject_id AND ms.section_id = e.section_id
      WHERE es.exam_id = $1 AND m.student_id = ANY($2)`, [examId, students.map((s) => s.student_id)]);
  const attendance = await q(
    `SELECT a.student_id, count(*) AS total, ${PCT_SQL} AS percent FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id
      WHERE e.academic_year_id = $1 AND a.student_id = ANY($2) AND ($3::date IS NULL OR a.date <= $3) GROUP BY a.student_id`,
    [exam.academic_year_id, students.map((s) => s.student_id), exam.end_date]);
  const remarks = await q('SELECT * FROM report_card_remarks WHERE exam_id = $1 AND student_id = ANY($2)', [examId, students.map((s) => s.student_id)]);

  const out = students.map((st) => {
    const subs = subjects.filter((s) => s.class_level_id === st.class_level_id).map((s) => {
      const m = marks.find((x) => x.exam_subject_id === s.id && x.student_id === st.student_id);
      const visible = m && (!opts.onlyApproved || m.submission_status === 'approved');
      const obtained = visible && !m.is_absent ? m.marks_obtained : null;
      const pct = obtained != null ? (obtained / s.max_marks) * 100 : null;
      return {
        examSubjectId: s.id, subjectId: s.subject_id, subject: s.subject_name, subjectHi: s.subject_name_hi, maxMarks: s.max_marks, passMarks: s.pass_marks,
        obtained, isAbsent: !!(visible && m.is_absent), entered: !!visible, remarks: visible ? m.remarks : null,
        grade: gradeFor(bands, pct)?.grade ?? null, passed: visible ? !m.is_absent && obtained != null && obtained >= s.pass_marks : null,
        submissionStatus: m?.submission_status ?? null,
      };
    });
    const entered = subs.filter((s) => s.entered);
    const total = round2(entered.reduce((a, s) => a + (s.obtained ?? 0), 0));
    const max = round2(entered.reduce((a, s) => a + s.maxMarks, 0));
    const percent = max > 0 ? round2((total / max) * 100) : null;
    const complete = subs.length > 0 && entered.length === subs.length;
    const g = gradeFor(bands, percent);
    const att = attendance.find((a) => a.student_id === st.student_id);
    const rm = remarks.find((r) => r.student_id === st.student_id);
    return {
      ...st, subjects: subs, total, max, percent, grade: g?.grade ?? null, gradeRemark: g?.remark ?? null, complete,
      result: !complete ? 'incomplete' : subs.every((s) => s.passed) && (percent ?? 0) >= exam.pass_percent ? 'pass' : 'fail',
      attendancePercent: att?.percent ?? null, teacherRemark: rm?.teacher_remark ?? null, principalRemark: rm?.principal_remark ?? null,
    };
  });
  // Rank within section by percentage (only complete results).
  const bySection = new Map<number, any[]>();
  for (const s of out) if (s.complete) bySection.set(s.section_id, [...(bySection.get(s.section_id) ?? []), s]);
  for (const list of bySection.values()) {
    list.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
    list.forEach((s, i) => { s.rank = i > 0 && list[i - 1].percent === s.percent ? list[i - 1].rank : i + 1; });
  }
  return { exam, bands, students: out };
}

export async function computeDescriptive(examId: number, opts: { sectionId?: number | null; studentId?: number | null }) {
  const exam = await one('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return null;
  const domains = await q('SELECT * FROM assessment_domains WHERE is_active ORDER BY sort_order');
  const students = await q(
    `SELECT e.id AS enrollment_id, e.student_id, e.roll_no, e.section_id, st.first_name, st.last_name, st.name_hi, st.student_code, st.admission_no, st.dob,
            cl.name AS class_name, cl.name_hi AS class_name_hi, sec.name AS section_name
       FROM enrollments e JOIN students st ON st.id = e.student_id JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
      WHERE e.academic_year_id = $1 AND cl.is_preschool AND ($2::bigint IS NULL OR e.section_id = $2) AND ($3::bigint IS NULL OR e.student_id = $3)
      ORDER BY cl.sort_order, sec.name, e.roll_no`, [exam.academic_year_id, opts.sectionId ?? null, opts.studentId ?? null]);
  const ratings = await q('SELECT * FROM development_assessments WHERE exam_id = $1 AND student_id = ANY($2)', [examId, students.map((s) => s.student_id)]);
  const remarks = await q('SELECT * FROM report_card_remarks WHERE exam_id = $1 AND student_id = ANY($2)', [examId, students.map((s) => s.student_id)]);
  const attendance = await q(
    `SELECT a.student_id, ${PCT_SQL} AS percent FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id
      WHERE e.academic_year_id = $1 AND a.student_id = ANY($2) GROUP BY a.student_id`, [exam.academic_year_id, students.map((s) => s.student_id)]);
  return {
    exam, domains,
    students: students.map((st) => ({
      ...st,
      ratings: domains.map((d) => {
        const r = ratings.find((x) => x.student_id === st.student_id && x.domain_id === d.id);
        return { domainId: d.id, domain: d.name, domainHi: d.name_hi, rating: r?.rating ?? null, comment: r?.comment ?? null };
      }),
      attendancePercent: attendance.find((a) => a.student_id === st.student_id)?.percent ?? null,
      teacherRemark: remarks.find((r) => r.student_id === st.student_id)?.teacher_remark ?? null,
      principalRemark: remarks.find((r) => r.student_id === st.student_id)?.principal_remark ?? null,
    })),
  };
}
