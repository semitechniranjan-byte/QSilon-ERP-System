import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { assertSectionAccess, assertSubjectAccess, can, requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, id, optDate, optId, optStr, str } from '../lib/validate.js';
import { resolveYear } from '../lib/context.js';
import { computeDescriptive, computeResults } from '../services/results.js';
import { renderReportCardPdf } from '../pdf/reportcard.js';
import { settings } from '../lib/context.js';

export const examsRouter = Router();
const examSchema = z.object({
  academicYearId: id, termId: optId, name: str(120),
  examType: z.enum(['unit', 'term', 'half_yearly', 'final', 'preschool_assessment', 'other']),
  assessmentMode: z.enum(['marks', 'descriptive']), gradingScaleId: optId, passPercent: z.coerce.number().min(0).max(100).default(33),
  startDate: optDate, endDate: optDate,
});

examsRouter.get('/', ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  const u = req.user!;
  if (u.role === 'student') throw forbidden('Use My Results.');
  const staffAll = can(req, 'exams.manage');
  res.json(await q(
    `SELECT e.*, t.name AS term_name,
            (SELECT count(*) FROM exam_subjects es WHERE es.exam_id = e.id) AS subject_count,
            (SELECT count(*) FROM mark_submissions ms JOIN exam_subjects es ON es.id = ms.exam_subject_id WHERE es.exam_id = e.id AND ms.status = 'submitted') AS pending_review,
            (SELECT count(*) FROM mark_submissions ms JOIN exam_subjects es ON es.id = ms.exam_subject_id WHERE es.exam_id = e.id AND ms.status = 'approved') AS approved
       FROM exams e LEFT JOIN terms t ON t.id = e.term_id
      WHERE e.academic_year_id = $1 AND ($2 OR e.status <> 'draft' OR e.schedule_published)
      ORDER BY e.start_date NULLS LAST, e.id`, [y.id, staffAll]));
}));
examsRouter.post('/', requirePerm('exams.manage'), ah(async (req, res) => {
  const b = examSchema.parse(req.body);
  const e = await one(
    `INSERT INTO exams (academic_year_id, term_id, name, exam_type, assessment_mode, grading_scale_id, pass_percent, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.academicYearId, b.termId, b.name, b.examType, b.examType === 'preschool_assessment' ? 'descriptive' : b.assessmentMode, b.gradingScaleId, b.passPercent, b.startDate, b.endDate]);
  await audit(req, 'exam.create', 'exam', e.id, b);
  res.status(201).json(e);
}));
examsRouter.put('/:id', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const b = examSchema.omit({ academicYearId: true }).parse(req.body);
  const e = await one(
    `UPDATE exams SET term_id=$2, name=$3, exam_type=$4, assessment_mode=$5, grading_scale_id=$6, pass_percent=$7, start_date=$8, end_date=$9
      WHERE id=$1 AND status <> 'published' RETURNING *`,
    [eid, b.termId, b.name, b.examType, b.examType === 'preschool_assessment' ? 'descriptive' : b.assessmentMode, b.gradingScaleId, b.passPercent, b.startDate, b.endDate]);
  if (!e) throw badRequest('Exam not found or already published (withdraw it first).');
  await audit(req, 'exam.update', 'exam', eid, b);
  res.json(e);
}));
examsRouter.get('/:id', ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  if (req.user!.role === 'student') throw forbidden();
  const exam = await one('SELECT e.*, t.name AS term_name FROM exams e LEFT JOIN terms t ON t.id = e.term_id WHERE e.id = $1', [eid]);
  if (!exam) throw notFound();
  const subjects = await q(
    `SELECT es.*, s.name AS subject_name, cl.name AS class_name, cl.sort_order FROM exam_subjects es JOIN subjects s ON s.id = es.subject_id
       JOIN class_levels cl ON cl.id = es.class_level_id WHERE es.exam_id = $1 ORDER BY cl.sort_order, es.exam_date NULLS LAST, s.name`, [eid]);
  const submissions = can(req, 'exams.manage') ? await q(
    `SELECT es.id AS exam_subject_id, sec.id AS section_id, cl.name AS class_name, sec.name AS section_name, s.name AS subject_name,
            coalesce(ms.status, 'not_started') AS status, ms.id AS submission_id, ms.submitted_at, ms.review_note,
            t.first_name || coalesce(' ' || t.last_name, '') AS teacher_name,
            (SELECT count(*) FROM marks m JOIN enrollments en ON en.id = m.enrollment_id WHERE m.exam_subject_id = es.id AND en.section_id = sec.id) AS entered,
            (SELECT count(*) FROM enrollments en WHERE en.section_id = sec.id AND en.status = 'active') AS students
       FROM exam_subjects es JOIN sections sec ON sec.class_level_id = es.class_level_id AND sec.academic_year_id = $2 AND sec.is_active
       JOIN class_levels cl ON cl.id = es.class_level_id JOIN subjects s ON s.id = es.subject_id
       LEFT JOIN mark_submissions ms ON ms.exam_subject_id = es.id AND ms.section_id = sec.id
       LEFT JOIN teaching_assignments ta ON ta.section_id = sec.id AND ta.subject_id = es.subject_id LEFT JOIN teachers t ON t.id = ta.teacher_id
      WHERE es.exam_id = $1 ORDER BY cl.sort_order, sec.name, s.name`, [eid, exam.academic_year_id]) : [];
  res.json({ ...exam, subjects, submissions });
}));

examsRouter.put('/:id/subjects', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const tm = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().regex(/^\d{2}:\d{2}$/).nullable());
  const b = z.object({ classLevelId: id, subjects: z.array(z.object({
    subjectId: id, maxMarks: z.coerce.number().positive().max(1000), passMarks: z.coerce.number().min(0).max(1000), examDate: optDate, startTime: tm.optional(),
    durationMin: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().max(600).nullable()).optional(),
  })).max(30) }).parse(req.body);
  await tx(async (c) => {
    const exam = await one('SELECT * FROM exams WHERE id=$1 FOR UPDATE', [eid], c);
    if (!exam) throw notFound();
    if (exam.status === 'published') throw badRequest('Withdraw the published results before changing subjects.');
    for (const s of b.subjects) if (s.passMarks > s.maxMarks) throw badRequest('Pass marks cannot exceed maximum marks.');
    const keep = b.subjects.map((s) => s.subjectId);
    const withMarks = await one(`SELECT 1 FROM exam_subjects es WHERE es.exam_id=$1 AND es.class_level_id=$2 AND NOT (es.subject_id = ANY($3))
                                   AND EXISTS (SELECT 1 FROM marks m WHERE m.exam_subject_id = es.id) LIMIT 1`, [eid, b.classLevelId, keep], c);
    if (withMarks) throw badRequest('A removed subject already has marks entered.');
    await c.query(`DELETE FROM mark_submissions WHERE exam_subject_id IN (SELECT id FROM exam_subjects WHERE exam_id=$1 AND class_level_id=$2 AND NOT (subject_id = ANY($3)))`, [eid, b.classLevelId, keep]);
    await c.query('DELETE FROM exam_subjects WHERE exam_id=$1 AND class_level_id=$2 AND NOT (subject_id = ANY($3))', [eid, b.classLevelId, keep]);
    for (const s of b.subjects) {
      const over = await one(`SELECT 1 FROM marks m JOIN exam_subjects es ON es.id = m.exam_subject_id WHERE es.exam_id=$1 AND es.class_level_id=$2 AND es.subject_id=$3 AND m.marks_obtained > $4 LIMIT 1`,
        [eid, b.classLevelId, s.subjectId, s.maxMarks], c);
      if (over) throw badRequest('Some entered marks exceed the new maximum marks.');
      await c.query(
        `INSERT INTO exam_subjects (exam_id, class_level_id, subject_id, max_marks, pass_marks, exam_date, start_time, duration_min) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (exam_id, class_level_id, subject_id) DO UPDATE SET max_marks=EXCLUDED.max_marks, pass_marks=EXCLUDED.pass_marks, exam_date=EXCLUDED.exam_date,
           start_time=EXCLUDED.start_time, duration_min=EXCLUDED.duration_min`,
        [eid, b.classLevelId, s.subjectId, s.maxMarks, s.passMarks, s.examDate, s.startTime ?? null, s.durationMin ?? null]);
    }
    await audit(req, 'exam.subjects', 'exam', eid, b, c);
  });
  res.json({ ok: true });
}));

examsRouter.delete('/:id', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  await tx(async (c) => {
    const e = await one('SELECT status FROM exams WHERE id=$1 FOR UPDATE', [eid], c);
    if (!e) throw notFound();
    const used = await one(`SELECT (SELECT count(*) FROM marks m JOIN exam_subjects es ON es.id = m.exam_subject_id WHERE es.exam_id = $1)
                                 + (SELECT count(*) FROM development_assessments WHERE exam_id = $1) AS n`, [eid], c);
    if (Number(used.n) > 0 || e.status === 'published') throw badRequest('Marks have already been entered for this exam, so it cannot be deleted. Withdraw it instead.');
    await c.query('DELETE FROM mark_submissions WHERE exam_subject_id IN (SELECT id FROM exam_subjects WHERE exam_id=$1)', [eid]);
    await c.query('DELETE FROM report_card_remarks WHERE exam_id=$1', [eid]);
    await c.query('DELETE FROM exams WHERE id=$1', [eid]); // exam_subjects cascade
    await audit(req, 'exam.delete', 'exam', eid, undefined, c);
  });
  res.json({ ok: true });
}));

examsRouter.post('/:id/status', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const b = z.object({ status: z.enum(['draft', 'marks_entry']).optional(), schedulePublished: bool.optional() }).parse(req.body);
  const e = await one(`UPDATE exams SET status = coalesce($2, status), schedule_published = coalesce($3, schedule_published)
                        WHERE id=$1 AND status NOT IN ('published') RETURNING *`, [eid, b.status ?? null, b.schedulePublished ?? null]);
  if (!e) throw badRequest('Exam not found or already published.');
  await audit(req, 'exam.status', 'exam', eid, b);
  res.json(e);
}));
examsRouter.post('/:id/publish', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const out = await tx(async (c) => {
    const e = await one('SELECT * FROM exams WHERE id=$1 FOR UPDATE', [eid], c);
    if (!e) throw notFound();
    if (e.status === 'published') throw badRequest('Already published.');
    const counts = await one(
      `SELECT count(*) FILTER (WHERE ms.status = 'approved') AS approved, count(*) FILTER (WHERE ms.status IN ('draft','submitted','returned')) AS pending
         FROM mark_submissions ms JOIN exam_subjects es ON es.id = ms.exam_subject_id WHERE es.exam_id = $1`, [eid], c);
    if (e.assessment_mode === 'marks' && counts.approved === 0) throw badRequest('Approve at least one set of submitted marks before publishing.');
    await c.query(`UPDATE exams SET status='published', published_at=now(), published_by=$2 WHERE id=$1`, [eid, req.user!.id]);
    await audit(req, 'exam.publish', 'exam', eid, { approved: counts.approved, pendingNotIncluded: counts.pending }, c);
    return { approved: counts.approved, pendingNotIncluded: counts.pending };
  });
  res.json({ ok: true, ...out, note: out.pendingNotIncluded ? 'Marks that are not yet approved are not visible to students.' : undefined });
}));
examsRouter.post('/:id/withdraw', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const { reason } = z.object({ reason: str(300) }).parse(req.body);
  const e = await one(`UPDATE exams SET status='withdrawn' WHERE id=$1 AND status='published' RETURNING id`, [eid]);
  if (!e) throw badRequest('Only published results can be withdrawn.');
  await audit(req, 'exam.withdraw', 'exam', eid, { reason });
  res.json({ ok: true });
}));
examsRouter.post('/:id/reopen', requirePerm('exams.manage'), ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const e = await one(`UPDATE exams SET status='marks_entry' WHERE id=$1 AND status='withdrawn' RETURNING id`, [eid]);
  if (!e) throw badRequest('Only withdrawn exams can be reopened for marks entry.');
  await audit(req, 'exam.reopen', 'exam', eid);
  res.json({ ok: true });
}));

// ---------- Review of submitted marks ----------
examsRouter.post('/submissions/:id/review', requirePerm('exams.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = z.object({ action: z.enum(['approve', 'return']), note: optStr(500).optional() }).parse(req.body);
  const r = await one(
    `UPDATE mark_submissions ms SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
       FROM exam_subjects es JOIN exams e ON e.id = es.exam_id
      WHERE ms.id = $1 AND es.id = ms.exam_subject_id AND ms.status = 'submitted' AND e.status <> 'published' RETURNING ms.id`,
    [sid, b.action === 'approve' ? 'approved' : 'returned', req.user!.id, b.note ?? null]);
  if (!r) throw badRequest('Submission not found, not awaiting review, or exam already published.');
  await audit(req, `marks.${b.action}`, 'mark_submission', sid, b);
  res.json({ ok: true });
}));

// ---------- Teacher marks entry ----------
async function sheetContext(req: Request, examId: number, sectionId: number, subjectId: number) {
  await assertSubjectAccess(req, sectionId, subjectId);
  const exam = await one('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw notFound('Exam not found.');
  if (exam.assessment_mode !== 'marks') throw badRequest('This assessment uses descriptive progress, not marks.');
  const sec = await one('SELECT * FROM sections WHERE id=$1', [sectionId]);
  if (!sec || sec.academic_year_id !== exam.academic_year_id) throw badRequest('Section is not part of this exam\'s academic year.');
  const es = await one('SELECT * FROM exam_subjects WHERE exam_id=$1 AND class_level_id=$2 AND subject_id=$3', [examId, sec.class_level_id, subjectId]);
  if (!es) throw badRequest('This subject is not part of the exam for this class.');
  const sub = await one('SELECT * FROM mark_submissions WHERE exam_subject_id=$1 AND section_id=$2', [es.id, sectionId]);
  const status = sub?.status ?? 'draft';
  const isAdmin = can(req, 'exams.manage');
  const editable = exam.status === 'marks_entry' && (isAdmin ? status !== 'approved' : ['draft', 'returned'].includes(status));
  return { exam, sec, es, sub, status, editable };
}
examsRouter.get('/marks/sheet', ah(async (req, res) => {
  const f = z.object({ examId: id, sectionId: id, subjectId: id }).parse(req.query);
  const ctx = await sheetContext(req, f.examId, f.sectionId, f.subjectId);
  const students = await q(
    `SELECT e.id AS enrollment_id, e.student_id, e.roll_no, st.first_name, st.last_name, st.student_code, m.marks_obtained, m.is_absent, m.remarks
       FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN marks m ON m.exam_subject_id = $2 AND m.student_id = e.student_id
      WHERE e.section_id = $1 AND e.status IN ('active','promoted','detained','completed') ORDER BY e.roll_no`, [f.sectionId, ctx.es.id]);
  res.json({ exam: ctx.exam, examSubject: ctx.es, submission: ctx.sub ?? null, status: ctx.status, editable: ctx.editable, students });
}));
examsRouter.put('/marks/sheet', ah(async (req, res) => {
  const b = z.object({ examId: id, sectionId: id, subjectId: id, entries: z.array(z.object({
    studentId: id, marks: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).nullable()), isAbsent: bool.default(false), remarks: optStr(300).optional(),
  })).max(200) }).parse(req.body);
  const ctx = await sheetContext(req, b.examId, b.sectionId, b.subjectId);
  if (!ctx.editable) throw forbidden(ctx.exam.status !== 'marks_entry' ? 'Marks entry is not open for this exam.' : 'Marks have been submitted for review and are locked.');
  await tx(async (c) => {
    const enrolled = new Map((await c.query(`SELECT student_id, id FROM enrollments WHERE section_id=$1`, [b.sectionId])).rows.map((r) => [Number(r.student_id), Number(r.id)]));
    for (const e of b.entries) {
      const enr = enrolled.get(e.studentId);
      if (!enr) throw badRequest('A student is not enrolled in this section.');
      if (e.marks != null && e.marks > ctx.es.max_marks) throw badRequest(`Marks cannot exceed the maximum of ${ctx.es.max_marks}.`);
      if (e.marks != null && Math.round(e.marks * 100) !== e.marks * 100) throw badRequest('Use at most two decimal places.');
      if (e.marks == null && !e.isAbsent) {
        await c.query('DELETE FROM marks WHERE exam_subject_id=$1 AND student_id=$2', [ctx.es.id, e.studentId]);
        continue;
      }
      await c.query(
        `INSERT INTO marks (exam_subject_id, student_id, enrollment_id, marks_obtained, is_absent, remarks, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (exam_subject_id, student_id) DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained, is_absent=EXCLUDED.is_absent, remarks=EXCLUDED.remarks,
           entered_by=EXCLUDED.entered_by, updated_at=now()`,
        [ctx.es.id, e.studentId, enr, e.isAbsent ? null : e.marks, e.isAbsent, e.remarks ?? null, req.user!.id]);
    }
    await c.query(`INSERT INTO mark_submissions (exam_subject_id, section_id, status) VALUES ($1,$2,'draft') ON CONFLICT (exam_subject_id, section_id) DO NOTHING`, [ctx.es.id, b.sectionId]);
    await audit(req, 'marks.save', 'exam_subject', ctx.es.id, { sectionId: b.sectionId, count: b.entries.length }, c);
  });
  res.json({ ok: true });
}));
examsRouter.post('/marks/submit', ah(async (req, res) => {
  const b = z.object({ examId: id, sectionId: id, subjectId: id }).parse(req.body);
  const ctx = await sheetContext(req, b.examId, b.sectionId, b.subjectId);
  if (!ctx.editable) throw forbidden('These marks cannot be submitted now.');
  const missing = await one(
    `SELECT count(*) AS n FROM enrollments e WHERE e.section_id=$1 AND e.status='active'
        AND NOT EXISTS (SELECT 1 FROM marks m WHERE m.exam_subject_id=$2 AND m.student_id=e.student_id)`, [b.sectionId, ctx.es.id]);
  if (missing.n > 0) throw badRequest(`Enter marks (or mark absent) for all students before submitting. ${missing.n} remaining.`);
  await one(
    `INSERT INTO mark_submissions (exam_subject_id, section_id, status, submitted_by, submitted_at) VALUES ($1,$2,'submitted',$3,now())
     ON CONFLICT (exam_subject_id, section_id) DO UPDATE SET status='submitted', submitted_by=EXCLUDED.submitted_by, submitted_at=now() RETURNING id`,
    [ctx.es.id, b.sectionId, req.user!.id]);
  await audit(req, 'marks.submit', 'exam_subject', ctx.es.id, { sectionId: b.sectionId });
  res.json({ ok: true });
}));

// ---------- Preschool descriptive assessment ----------
examsRouter.get('/assessment/sheet', ah(async (req, res) => {
  const f = z.object({ examId: id, sectionId: id }).parse(req.query);
  await assertSectionAccess(req, f.sectionId);
  const exam = await one('SELECT * FROM exams WHERE id=$1', [f.examId]);
  if (!exam || exam.assessment_mode !== 'descriptive') throw badRequest('Not a descriptive assessment.');
  const data = await computeDescriptive(f.examId, { sectionId: f.sectionId });
  res.json({ ...data, editable: exam.status === 'marks_entry' });
}));
examsRouter.put('/assessment/sheet', ah(async (req, res) => {
  const b = z.object({ examId: id, sectionId: id, entries: z.array(z.object({
    studentId: id, domainId: id, rating: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.enum(['beginning', 'developing', 'proficient', 'excellent']).nullable()), comment: optStr(500).optional(),
  })).max(2000), remarks: z.array(z.object({ studentId: id, teacherRemark: optStr(1000) })).max(200).optional() }).parse(req.body);
  await assertSectionAccess(req, b.sectionId);
  const exam = await one('SELECT * FROM exams WHERE id=$1', [b.examId]);
  if (!exam || exam.assessment_mode !== 'descriptive') throw badRequest('Not a descriptive assessment.');
  if (exam.status !== 'marks_entry') throw forbidden('Assessment entry is not open.');
  await tx(async (c) => {
    const enrolled = new Map((await c.query(`SELECT student_id, id FROM enrollments WHERE section_id=$1`, [b.sectionId])).rows.map((r) => [Number(r.student_id), Number(r.id)]));
    for (const e of b.entries) {
      const enr = enrolled.get(e.studentId);
      if (!enr) throw badRequest('A student is not enrolled in this section.');
      if (!e.rating) { await c.query('DELETE FROM development_assessments WHERE exam_id=$1 AND student_id=$2 AND domain_id=$3', [b.examId, e.studentId, e.domainId]); continue; }
      await c.query(
        `INSERT INTO development_assessments (exam_id, student_id, enrollment_id, domain_id, rating, comment, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (exam_id, student_id, domain_id) DO UPDATE SET rating=EXCLUDED.rating, comment=EXCLUDED.comment, entered_by=EXCLUDED.entered_by, updated_at=now()`,
        [b.examId, e.studentId, enr, e.domainId, e.rating, e.comment ?? null, req.user!.id]);
    }
    for (const r of b.remarks ?? []) {
      if (!enrolled.has(r.studentId)) throw badRequest('A student is not enrolled in this section.');
      await c.query(`INSERT INTO report_card_remarks (exam_id, student_id, teacher_remark, updated_by) VALUES ($1,$2,$3,$4)
                     ON CONFLICT (exam_id, student_id) DO UPDATE SET teacher_remark=EXCLUDED.teacher_remark, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [b.examId, r.studentId, r.teacherRemark, req.user!.id]);
    }
    await audit(req, 'assessment.save', 'exam', b.examId, { sectionId: b.sectionId, count: b.entries.length }, c);
  });
  res.json({ ok: true });
}));

// ---------- Results & report cards ----------
async function assertResultsAccess(req: Request, sectionId: number) {
  if (can(req, 'exams.manage')) return;
  const u = req.user!;
  if (u.role === 'teacher') {
    const s = await one('SELECT 1 FROM sections WHERE id=$1 AND class_teacher_id=$2', [sectionId, u.teacherId]);
    if (s) return;
  }
  throw forbidden('Only the class teacher or Principal can view full class results.');
}
examsRouter.get('/:id/results', ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const { sectionId } = z.object({ sectionId: id }).parse(req.query);
  await assertResultsAccess(req, sectionId);
  const exam = await one('SELECT assessment_mode FROM exams WHERE id=$1', [eid]);
  if (!exam) throw notFound();
  res.json(exam.assessment_mode === 'descriptive' ? await computeDescriptive(eid, { sectionId }) : await computeResults(eid, { sectionId, onlyApproved: false }));
}));
examsRouter.put('/:id/remarks/:studentId', ah(async (req, res) => {
  const eid = id.parse(req.params.id);
  const sid = id.parse(req.params.studentId);
  const b = z.object({ teacherRemark: optStr(1000).optional(), principalRemark: optStr(1000).optional() }).parse(req.body);
  const e = await one(`SELECT en.section_id FROM enrollments en JOIN exams x ON x.academic_year_id = en.academic_year_id WHERE x.id=$1 AND en.student_id=$2`, [eid, sid]);
  if (!e) throw notFound();
  const isAdmin = can(req, 'exams.manage');
  if (!isAdmin) await assertResultsAccess(req, e.section_id);
  if (b.principalRemark !== undefined && !isAdmin) throw forbidden('Only the Principal can add the principal\'s remark.');
  await one(
    `INSERT INTO report_card_remarks (exam_id, student_id, teacher_remark, principal_remark, updated_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET teacher_remark = CASE WHEN $6 THEN EXCLUDED.teacher_remark ELSE report_card_remarks.teacher_remark END,
       principal_remark = CASE WHEN $7 THEN EXCLUDED.principal_remark ELSE report_card_remarks.principal_remark END, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING exam_id`,
    [eid, sid, b.teacherRemark ?? null, b.principalRemark ?? null, req.user!.id, b.teacherRemark !== undefined, b.principalRemark !== undefined]);
  await audit(req, 'report_card.remarks', 'student', sid, { examId: eid });
  res.json({ ok: true });
}));

/** Report card for one student. Students only see their own, and only after publication with approved marks. */
export async function reportCardData(req: Request, examId: number, studentId: number) {
  const exam = await one('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw notFound();
  const u = req.user!;
  let onlyApproved = false;
  if (u.role === 'student') {
    if (u.studentId !== studentId) throw forbidden();
    if (exam.status !== 'published') throw forbidden('Results are not published yet.');
    onlyApproved = true;
  } else if (!can(req, 'exams.manage')) {
    const e = await one(`SELECT section_id FROM enrollments WHERE student_id=$1 AND academic_year_id=$2`, [studentId, exam.academic_year_id]);
    if (!e) throw notFound();
    await assertResultsAccess(req, e.section_id);
  }
  const data = exam.assessment_mode === 'descriptive'
    ? await computeDescriptive(examId, { studentId })
    : await computeResults(examId, { studentId, onlyApproved });
  const st = data?.students[0];
  if (!st) throw notFound('No result found for this student in this exam.');
  return { exam, student: st, mode: exam.assessment_mode as 'marks' | 'descriptive', year: await one('SELECT name FROM academic_years WHERE id=$1', [exam.academic_year_id]) };
}
examsRouter.get('/:id/report-card/:studentId', ah(async (req, res) => {
  res.json(await reportCardData(req, id.parse(req.params.id), id.parse(req.params.studentId)));
}));
examsRouter.get('/:id/report-card/:studentId/pdf', ah(async (req, res) => {
  const d = await reportCardData(req, id.parse(req.params.id), id.parse(req.params.studentId));
  const s = await settings();
  const logo = s.logo_file_id ? await one('SELECT data, mime_type FROM files WHERE id=$1', [s.logo_file_id]) : null;
  const pdf = await renderReportCardPdf(d, s, req.query.lang === 'hi' ? 'hi' : 'en', logo?.mime_type !== 'image/webp' ? logo?.data : null);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="report-card-${d.student.student_code}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}));
