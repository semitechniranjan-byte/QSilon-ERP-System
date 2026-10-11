import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { id, optStr, str } from '../lib/validate.js';
import { settings } from '../lib/context.js';
import { todayIST } from '../lib/dates.js';
import { PCT_SQL } from '../lib/sql.js';
import { computeDescriptive, computeResults } from '../services/results.js';
import { gradeAttempt, quizForStudent } from '../services/quiz.js';
import { feedFor } from './notices.js';
import { statement } from './fees.js';
import { reportCardData } from './exams.js';

/**
 * Student portal. Every query is scoped to req.user.studentId — student IDs are never taken from the URL or body,
 * so one student can never reach another student's records.
 */
export const meRouter = Router();
meRouter.use((req, _res, next) => (req.user?.role === 'student' && req.user.studentId ? next() : next(forbidden('Student portal only.'))));
const sid = (req: Request) => req.user!.studentId!;

async function currentEnrollment(studentId: number) {
  return one(
    `SELECT e.*, y.name AS year_name, cl.name AS class_name, cl.name_hi AS class_name_hi, cl.is_preschool, sec.name AS section_name,
            b.code AS board, b.name AS board_name, m.code AS medium, m.name AS medium_name, r.name AS route_name,
            t.first_name || coalesce(' ' || t.last_name, '') AS class_teacher
       FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current JOIN class_levels cl ON cl.id = e.class_level_id
       JOIN sections sec ON sec.id = e.section_id LEFT JOIN boards b ON b.id = sec.board_id LEFT JOIN mediums m ON m.id = sec.medium_id
       LEFT JOIN transport_routes r ON r.id = e.transport_route_id LEFT JOIN teachers t ON t.id = sec.class_teacher_id
      WHERE e.student_id = $1`, [studentId]);
}

meRouter.get('/profile', ah(async (req, res) => {
  const st = await one(`SELECT id, student_code, admission_no, first_name, last_name, name_hi, dob, gender, blood_group, photo_file_id, address,
                               emergency_contact_name, emergency_contact_phone, admission_date, status FROM students WHERE id = $1`, [sid(req)]);
  const enrollment = await currentEnrollment(sid(req));
  const guardians = await q(`SELECT g.name, sg.relation, g.phone, g.email, sg.is_primary FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = $1 ORDER BY sg.is_primary DESC`, [sid(req)]);
  const subjects = enrollment ? await q(
    `SELECT sub.id, sub.name, sub.name_hi, cs.is_optional, t.first_name || coalesce(' ' || t.last_name, '') AS teacher
       FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN teaching_assignments ta ON ta.section_id = $3 AND ta.subject_id = sub.id LEFT JOIN teachers t ON t.id = ta.teacher_id
      WHERE cs.academic_year_id = $1 AND cs.class_level_id = $2 ORDER BY sub.name`, [enrollment.academic_year_id, enrollment.class_level_id, enrollment.section_id]) : [];
  const hostel = await one(`SELECT h.name AS hostel_name, r.room_no, b.bed_no, a.check_in, h.warden_name, h.emergency_phone FROM hostel_allocations a JOIN hostel_beds b ON b.id = a.bed_id
                             JOIN hostel_rooms r ON r.id = a.room_id JOIN hostels h ON h.id = r.hostel_id WHERE a.student_id = $1 AND a.check_out IS NULL`, [sid(req)]);
  const history = await q(`SELECT y.name AS year_name, cl.name AS class_name, sec.name AS section_name, e.roll_no, e.status FROM enrollments e
                            JOIN academic_years y ON y.id = e.academic_year_id JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
                           WHERE e.student_id = $1 ORDER BY y.start_date DESC`, [sid(req)]);
  res.json({ student: st, enrollment, guardians, subjects, hostel, history });
}));

meRouter.get('/dashboard', ah(async (req, res) => {
  const s = sid(req);
  const enrollment = await currentEnrollment(s);
  const today = todayIST();
  const [attendance, assignments, quizzes, results, events, schedule] = await Promise.all([
    enrollment ? one(`SELECT count(*) AS total, count(*) FILTER (WHERE a.status IN ('present','late')) AS present, count(*) FILTER (WHERE a.status='absent') AS absent, ${PCT_SQL} AS percent
                        FROM attendance_records a WHERE a.enrollment_id = $1`, [enrollment.id]) : null,
    enrollment ? q(`SELECT a.id, a.title, a.due_date, sub.name AS subject_name, coalesce(x.status,'pending') AS status FROM assignments a JOIN subjects sub ON sub.id = a.subject_id
                     LEFT JOIN assignment_submissions x ON x.assignment_id = a.id AND x.student_id = $2
                    WHERE a.section_id = $1 AND a.status = 'published' AND coalesce(x.status,'pending') IN ('pending','returned') ORDER BY a.due_date NULLS LAST LIMIT 8`, [enrollment.section_id, s]) : [],
    enrollment ? q(`SELECT qz.id, qz.title, qz.available_from, qz.available_until, sub.name AS subject_name FROM quizzes qz JOIN subjects sub ON sub.id = qz.subject_id
                    WHERE qz.section_id = $1 AND qz.status = 'published' AND (qz.available_until IS NULL OR qz.available_until > now()) ORDER BY qz.available_from NULLS FIRST LIMIT 6`, [enrollment.section_id]) : [],
    q(`SELECT x.id, x.name, x.published_at, x.assessment_mode FROM exams x JOIN enrollments e ON e.academic_year_id = x.academic_year_id AND e.student_id = $1
        WHERE x.status = 'published' ORDER BY x.published_at DESC LIMIT 3`, [s]),
    q(`SELECT id, title, title_hi, event_type, start_date, end_date FROM events WHERE coalesce(end_date, start_date) >= $1 ORDER BY start_date LIMIT 6`, [today]),
    enrollment ? q(`SELECT x.name AS exam_name, es.exam_date, es.start_time, sub.name AS subject_name, es.max_marks FROM exam_subjects es JOIN exams x ON x.id = es.exam_id
                    JOIN subjects sub ON sub.id = es.subject_id WHERE x.academic_year_id = $1 AND es.class_level_id = $2 AND x.schedule_published
                      AND (es.exam_date IS NULL OR es.exam_date >= $3) ORDER BY es.exam_date NULLS LAST LIMIT 10`, [enrollment.academic_year_id, enrollment.class_level_id, today]) : [],
  ]);
  let latestResult = null;
  if (results[0] && results[0].assessment_mode === 'marks') {
    const r = await computeResults(results[0].id, { studentId: s, onlyApproved: true });
    const me = r?.students[0];
    if (me) latestResult = { examId: results[0].id, examName: results[0].name, percent: me.percent, grade: me.grade, result: me.result };
  }
  const st = await one('SELECT student_code, admission_no, first_name, last_name, photo_file_id FROM students WHERE id=$1', [s]);
  res.json({ student: st, enrollment, attendance, assignments, quizzes, latestResult, publishedExams: results, events, examSchedule: schedule, notices: await feedFor(req, 6) });
}));

// ---------- Assignments & materials ----------
meRouter.get('/assignments', ah(async (req, res) => {
  const e = await currentEnrollment(sid(req));
  if (!e) return res.json([]);
  res.json(await q(
    `SELECT a.id, a.title, a.description, a.due_date, a.max_marks, a.allow_submission, a.attachment_file_id, a.created_at, sub.name AS subject_name, sub.name_hi AS subject_name_hi,
            t.first_name || coalesce(' ' || t.last_name, '') AS teacher, coalesce(x.status, 'pending') AS status, x.submitted_at, x.marks, x.feedback, x.text_answer, x.file_id
       FROM assignments a JOIN subjects sub ON sub.id = a.subject_id JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN assignment_submissions x ON x.assignment_id = a.id AND x.student_id = $2
      WHERE a.section_id = $1 AND a.status IN ('published','closed') ORDER BY a.due_date DESC NULLS LAST, a.id DESC`, [e.section_id, sid(req)]));
}));
meRouter.post('/assignments/:id/submit', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const b = z.object({ text: optStr(10000), fileId: z.string().uuid().nullable().optional() }).parse(req.body);
  if (!b.text && !b.fileId) throw badRequest('Write an answer or attach a file.');
  const e = await currentEnrollment(sid(req));
  const a = await one(`SELECT * FROM assignments WHERE id = $1 AND section_id = $2 AND status = 'published'`, [aid, e?.section_id ?? -1]);
  if (!a) throw notFound('Assignment not found.');
  if (!a.allow_submission) throw badRequest('Online submission is not enabled for this assignment.');
  if (b.fileId) {
    const f = await one('SELECT uploaded_by, purpose FROM files WHERE id = $1', [b.fileId]);
    if (!f || f.uploaded_by !== req.user!.id || f.purpose !== 'submission') throw forbidden('Invalid file.');
  }
  const prev = await one('SELECT status FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2', [aid, sid(req)]);
  if (prev?.status === 'completed') throw badRequest('This assignment has already been reviewed as completed.');
  await one(
    `INSERT INTO assignment_submissions (assignment_id, student_id, text_answer, file_id, submitted_at, status) VALUES ($1,$2,$3,$4,now(),'submitted')
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET text_answer=EXCLUDED.text_answer, file_id=EXCLUDED.file_id, submitted_at=now(), status='submitted' RETURNING id`,
    [aid, sid(req), b.text, b.fileId ?? null]);
  res.json({ ok: true });
}));
meRouter.get('/materials', ah(async (req, res) => {
  const e = await currentEnrollment(sid(req));
  if (!e) return res.json([]);
  res.json(await q(`SELECT m.id, m.title, m.description, m.file_id, m.link_url, m.created_at, sub.name AS subject_name, f.original_name FROM study_materials m
                     JOIN subjects sub ON sub.id = m.subject_id LEFT JOIN files f ON f.id = m.file_id WHERE m.section_id = $1 ORDER BY m.created_at DESC`, [e.section_id]));
}));

// ---------- Quizzes ----------
meRouter.get('/quizzes', ah(async (req, res) => {
  const e = await currentEnrollment(sid(req));
  if (!e) return res.json([]);
  res.json(await q(
    `SELECT qz.id, qz.title, qz.instructions, qz.time_limit_min, qz.available_from, qz.available_until, qz.max_attempts, qz.status, qz.show_results, sub.name AS subject_name,
            (SELECT count(*) FROM quiz_questions x WHERE x.quiz_id = qz.id) AS questions,
            (SELECT json_agg(json_build_object('id', a.id, 'attempt_no', a.attempt_no, 'status', a.status, 'score', CASE WHEN qz.show_results THEN a.score END,
                     'max_score', a.max_score, 'submitted_at', a.submitted_at) ORDER BY a.attempt_no) FROM quiz_attempts a WHERE a.quiz_id = qz.id AND a.student_id = $2) AS attempts
       FROM quizzes qz JOIN subjects sub ON sub.id = qz.subject_id WHERE qz.section_id = $1 AND qz.status IN ('published','closed') ORDER BY qz.created_at DESC`, [e.section_id, sid(req)]));
}));
meRouter.post('/quizzes/:id/start', ah(async (req, res) => {
  const qid = id.parse(req.params.id);
  const out = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(3003, $1::int)', [sid(req)]);
    const qz = await quizForStudent(c, qid, sid(req));
    if (!qz || qz.status !== 'published') throw notFound('Quiz not available.');
    const now = new Date();
    if (qz.available_from && new Date(qz.available_from) > now) throw badRequest('This quiz has not opened yet.');
    if (qz.available_until && new Date(qz.available_until) < now) throw badRequest('This quiz has closed.');
    const open = await one(`SELECT id FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND status='in_progress'`, [qid, sid(req)], c);
    if (open) return { attemptId: open.id };
    const n = (await one('SELECT count(*) AS n FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2', [qid, sid(req)], c)).n;
    if (n >= qz.max_attempts) throw badRequest('You have used all attempts for this quiz.');
    let deadline: Date | null = qz.time_limit_min ? new Date(now.getTime() + qz.time_limit_min * 60000) : null;
    if (qz.available_until && (!deadline || new Date(qz.available_until) < deadline)) deadline = new Date(qz.available_until);
    const a = await one('INSERT INTO quiz_attempts (quiz_id, student_id, attempt_no, deadline_at) VALUES ($1,$2,$3,$4) RETURNING id', [qid, sid(req), n + 1, deadline], c);
    return { attemptId: a.id };
  });
  res.status(201).json(out);
}));
async function myAttempt(req: Request, attemptId: number) {
  const a = await one(`SELECT a.*, qz.title, qz.instructions, qz.show_results, qz.time_limit_min FROM quiz_attempts a JOIN quizzes qz ON qz.id = a.quiz_id WHERE a.id=$1 AND a.student_id=$2`, [attemptId, sid(req)]);
  if (!a) throw notFound('Attempt not found.');
  return a;
}
async function autoSubmitIfExpired(a: any) {
  if (a.status === 'in_progress' && a.deadline_at && new Date(a.deadline_at).getTime() + 30000 < Date.now()) {
    await tx(async (c) => { await gradeAttempt(c, a.id); });
    return true;
  }
  return false;
}
meRouter.get('/attempts/:id', ah(async (req, res) => {
  let a = await myAttempt(req, id.parse(req.params.id));
  if (await autoSubmitIfExpired(a)) a = await myAttempt(req, a.id);
  const done = a.status !== 'in_progress';
  const reveal = done && a.show_results;
  // Answer keys are never sent while the attempt is open, and only after submission if the teacher allows results.
  const questions = await q(
    `SELECT qq.id, qq.qtype, qq.prompt, qq.options, qq.marks, x.answer,
            ${reveal ? 'qq.correct_option, qq.correct_bool, x.is_correct, x.awarded_marks, x.needs_review, x.feedback' : 'NULL AS correct_option, NULL AS correct_bool, NULL AS is_correct, NULL AS awarded_marks, NULL AS needs_review, NULL AS feedback'}
       FROM quiz_questions qq LEFT JOIN quiz_answers x ON x.question_id = qq.id AND x.attempt_id = $1 WHERE qq.quiz_id = $2 ORDER BY qq.sort_order`, [a.id, a.quiz_id]);
  res.json({ id: a.id, quizId: a.quiz_id, title: a.title, instructions: a.instructions, status: a.status, deadlineAt: a.deadline_at, startedAt: a.started_at,
    submittedAt: a.submitted_at, score: reveal ? a.score : null, maxScore: a.max_score, feedback: reveal ? a.feedback : null, questions, serverNow: new Date().toISOString() });
}));
const answersSchema = z.object({ answers: z.array(z.object({ questionId: id, value: z.union([z.number().int().min(0).max(10), z.boolean(), z.string().max(5000)]).nullable() })).max(100) });
async function saveAnswers(c: any, a: any, answers: z.infer<typeof answersSchema>['answers']) {
  for (const x of answers) {
    const qq = await one('SELECT qtype FROM quiz_questions WHERE id=$1 AND quiz_id=$2', [x.questionId, a.quiz_id], c);
    if (!qq) throw badRequest('Unknown question.');
    const ok = x.value === null || (qq.qtype === 'mcq' && typeof x.value === 'number') || (qq.qtype === 'true_false' && typeof x.value === 'boolean') || (qq.qtype === 'short_answer' && typeof x.value === 'string');
    if (!ok) throw badRequest('Invalid answer format.');
    await c.query(`INSERT INTO quiz_answers (attempt_id, question_id, answer) VALUES ($1,$2,$3) ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer = EXCLUDED.answer`,
      [a.id, x.questionId, x.value === null ? null : JSON.stringify({ value: x.value })]);
  }
}
meRouter.put('/attempts/:id', ah(async (req, res) => {
  const a = await myAttempt(req, id.parse(req.params.id));
  if (await autoSubmitIfExpired(a)) throw badRequest('Time is up. Your saved answers were submitted.');
  if (a.status !== 'in_progress') throw badRequest('This attempt has already been submitted.');
  const b = answersSchema.parse(req.body);
  await tx(async (c) => saveAnswers(c, a, b.answers));
  res.json({ ok: true });
}));
meRouter.post('/attempts/:id/submit', ah(async (req, res) => {
  const a = await myAttempt(req, id.parse(req.params.id));
  if (a.status !== 'in_progress') throw badRequest('This attempt has already been submitted.');
  const b = answersSchema.parse(req.body ?? { answers: [] });
  const expired = a.deadline_at && new Date(a.deadline_at).getTime() + 30000 < Date.now();
  const r = await tx(async (c) => {
    if (!expired) await saveAnswers(c, a, b.answers); // late answers are ignored
    return gradeAttempt(c, a.id);
  });
  res.json({ ok: true, pendingReview: r.pending, score: a.show_results && !r.pending ? r.score : null, maxScore: r.max });
}));

// ---------- Results ----------
meRouter.get('/results', ah(async (req, res) => {
  const exams = await q(
    `SELECT x.id, x.name, x.exam_type, x.assessment_mode, x.published_at, y.name AS year_name FROM exams x JOIN academic_years y ON y.id = x.academic_year_id
       JOIN enrollments e ON e.academic_year_id = x.academic_year_id AND e.student_id = $1 WHERE x.status = 'published' ORDER BY y.start_date DESC, x.published_at DESC`, [sid(req)]);
  const out = [];
  for (const x of exams) {
    const r = x.assessment_mode === 'descriptive' ? await computeDescriptive(x.id, { studentId: sid(req) }) : await computeResults(x.id, { studentId: sid(req), onlyApproved: true });
    out.push({ exam: x, result: r?.students[0] ?? null });
  }
  res.json(out);
}));
meRouter.get('/results/:examId', ah(async (req, res) => {
  res.json(await reportCardData(req, id.parse(req.params.examId), sid(req)));
}));

// ---------- Fees ----------
meRouter.get('/fees', ah(async (req, res) => {
  if (!(await settings()).show_fees_to_students) throw forbidden('Fee information is available from the school office.');
  res.json(await statement(sid(req)));
}));

// ---------- Profile correction requests ----------
const FIELDS = ['address', 'blood_group', 'emergency_contact_name', 'emergency_contact_phone', 'name_hi', 'other'] as const;
meRouter.get('/corrections', ah(async (req, res) => {
  res.json(await q('SELECT id, field, requested_value, reason, status, response, created_at, reviewed_at FROM profile_correction_requests WHERE student_id=$1 ORDER BY created_at DESC', [sid(req)]));
}));
meRouter.post('/corrections', ah(async (req, res) => {
  const b = z.object({ field: z.enum(FIELDS), requestedValue: str(500), reason: optStr(500) }).parse(req.body);
  const pending = await one(`SELECT count(*) AS n FROM profile_correction_requests WHERE student_id=$1 AND status='pending'`, [sid(req)]);
  if (pending.n >= 5) throw badRequest('You already have several pending requests. Please wait for the office to review them.');
  const col = b.field === 'other' ? null : b.field;
  const cur = col ? (await one(`SELECT ${col} AS v FROM students WHERE id=$1`, [sid(req)]))?.v : null;
  await one('INSERT INTO profile_correction_requests (student_id, field, current_value, requested_value, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [sid(req), b.field, cur ?? null, b.requestedValue, b.reason]);
  res.status(201).json({ ok: true });
}));
