import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { assertSectionAccess, assertSubjectAccess } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, id, optDate, optId, optStr, str } from '../lib/validate.js';
import { gradeAttempt } from '../services/quiz.js';

export const learningRouter = Router();
learningRouter.use((req, _res, next) => (req.user!.role === 'teacher' || req.user!.role === 'admin' ? next() : next(forbidden())));

async function teacherIdFor(req: Request, sectionId: number, subjectId: number) {
  await assertSubjectAccess(req, sectionId, subjectId);
  if (req.user!.role === 'teacher') return req.user!.teacherId!;
  const ta = await one('SELECT teacher_id FROM teaching_assignments WHERE section_id=$1 AND subject_id=$2', [sectionId, subjectId]);
  if (!ta) throw badRequest('No teacher is assigned to this subject in the section.');
  return ta.teacher_id as number;
}
/** Owner teacher or admin may modify a learning item. */
function assertOwner(req: Request, teacherId: number) {
  if (req.user!.role === 'admin') return;
  if (req.user!.teacherId !== teacherId) throw forbidden('Only the teacher who created this can change it.');
}

// ---------- Assignments ----------
const assignmentSchema = z.object({
  sectionId: id, subjectId: id, title: str(200), description: optStr(5000), dueDate: optDate,
  maxMarks: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().positive().max(1000).nullable()),
  allowSubmission: bool.default(true), attachmentFileId: z.string().uuid().nullable().optional(), status: z.enum(['draft', 'published', 'closed']).default('published'),
});
learningRouter.get('/assignments', ah(async (req, res) => {
  const f = z.object({ sectionId: optId.optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  if (f.sectionId) await assertSectionAccess(req, f.sectionId);
  const tid = req.user!.role === 'teacher' ? req.user!.teacherId : null;
  res.json(await q(
    `SELECT a.*, sub.name AS subject_name, cl.name AS class_name, s.name AS section_name,
            (SELECT count(*) FROM enrollments e WHERE e.section_id = a.section_id AND e.status = 'active') AS students,
            (SELECT count(*) FROM assignment_submissions x WHERE x.assignment_id = a.id AND x.status IN ('submitted','completed')) AS submitted,
            (SELECT count(*) FROM assignment_submissions x WHERE x.assignment_id = a.id AND x.status = 'completed') AS completed
       FROM assignments a JOIN subjects sub ON sub.id = a.subject_id JOIN sections s ON s.id = a.section_id JOIN class_levels cl ON cl.id = s.class_level_id
       JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
      WHERE ($1::bigint IS NULL OR a.section_id = $1) AND ($2::bigint IS NULL OR a.teacher_id = $2)
      ORDER BY a.created_at DESC LIMIT 500`, [f.sectionId ?? null, f.sectionId ? null : tid]));
}));
learningRouter.post('/assignments', ah(async (req, res) => {
  const b = assignmentSchema.parse(req.body);
  const teacherId = await teacherIdFor(req, b.sectionId, b.subjectId);
  const a = await one(
    `INSERT INTO assignments (section_id, subject_id, teacher_id, title, description, due_date, max_marks, allow_submission, attachment_file_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.sectionId, b.subjectId, teacherId, b.title, b.description, b.dueDate, b.maxMarks, b.allowSubmission, b.attachmentFileId ?? null, b.status]);
  await audit(req, 'assignment.create', 'assignment', a.id, { sectionId: b.sectionId, subjectId: b.subjectId });
  res.status(201).json(a);
}));
learningRouter.put('/assignments/:id', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const cur = await one('SELECT * FROM assignments WHERE id=$1', [aid]);
  if (!cur) throw notFound();
  assertOwner(req, cur.teacher_id);
  const b = assignmentSchema.omit({ sectionId: true, subjectId: true }).parse(req.body);
  const a = await one(`UPDATE assignments SET title=$2, description=$3, due_date=$4, max_marks=$5, allow_submission=$6, attachment_file_id=$7, status=$8 WHERE id=$1 RETURNING *`,
    [aid, b.title, b.description, b.dueDate, b.maxMarks, b.allowSubmission, b.attachmentFileId ?? null, b.status]);
  res.json(a);
}));
learningRouter.get('/assignments/:id', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const a = await one(`SELECT a.*, sub.name AS subject_name, cl.name AS class_name, s.name AS section_name FROM assignments a JOIN subjects sub ON sub.id = a.subject_id
                        JOIN sections s ON s.id = a.section_id JOIN class_levels cl ON cl.id = s.class_level_id WHERE a.id=$1`, [aid]);
  if (!a) throw notFound();
  await assertSectionAccess(req, a.section_id);
  const students = await q(
    `SELECT e.student_id, e.roll_no, st.first_name, st.last_name, st.student_code, coalesce(x.status, 'pending') AS status, x.id AS submission_id,
            x.text_answer, x.file_id, x.submitted_at, x.marks, x.feedback, x.reviewed_at
       FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN assignment_submissions x ON x.assignment_id = $1 AND x.student_id = e.student_id
      WHERE e.section_id = $2 AND e.status = 'active' ORDER BY e.roll_no`, [aid, a.section_id]);
  res.json({ ...a, students });
}));
learningRouter.post('/assignments/:id/review', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const b = z.object({ studentId: id, status: z.enum(['pending', 'completed', 'returned']),
    marks: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).nullable()), feedback: optStr(2000) }).parse(req.body);
  const a = await one('SELECT * FROM assignments WHERE id=$1', [aid]);
  if (!a) throw notFound();
  await assertSubjectAccess(req, a.section_id, a.subject_id);
  if (b.marks != null && a.max_marks != null && b.marks > a.max_marks) throw badRequest(`Marks cannot exceed ${a.max_marks}.`);
  const enrolled = await one(`SELECT 1 FROM enrollments WHERE section_id=$1 AND student_id=$2`, [a.section_id, b.studentId]);
  if (!enrolled) throw badRequest('Student is not in this section.');
  await one(
    `INSERT INTO assignment_submissions (assignment_id, student_id, status, marks, feedback, reviewed_by, reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET status=EXCLUDED.status, marks=EXCLUDED.marks, feedback=EXCLUDED.feedback, reviewed_by=EXCLUDED.reviewed_by, reviewed_at=now() RETURNING id`,
    [aid, b.studentId, b.status, b.marks, b.feedback, req.user!.id]);
  res.json({ ok: true });
}));

// ---------- Study materials ----------
learningRouter.get('/materials', ah(async (req, res) => {
  const { sectionId } = z.object({ sectionId: id }).parse(req.query);
  await assertSectionAccess(req, sectionId);
  res.json(await q(`SELECT m.*, sub.name AS subject_name, f.original_name FROM study_materials m JOIN subjects sub ON sub.id = m.subject_id LEFT JOIN files f ON f.id = m.file_id
                     WHERE m.section_id = $1 ORDER BY m.created_at DESC`, [sectionId]));
}));
learningRouter.post('/materials', ah(async (req, res) => {
  const b = z.object({ sectionId: id, subjectId: id, title: str(200), description: optStr(2000), fileId: z.string().uuid().nullable().optional(),
    linkUrl: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().url().max(500).nullable().optional()) }).parse(req.body);
  if (!b.fileId && !b.linkUrl) throw badRequest('Attach a file or a link.');
  const tid = await teacherIdFor(req, b.sectionId, b.subjectId);
  res.status(201).json(await one(`INSERT INTO study_materials (section_id, subject_id, teacher_id, title, description, file_id, link_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.sectionId, b.subjectId, tid, b.title, b.description, b.fileId ?? null, b.linkUrl ?? null]));
}));
learningRouter.delete('/materials/:id', ah(async (req, res) => {
  const m = await one('SELECT * FROM study_materials WHERE id=$1', [id.parse(req.params.id)]);
  if (!m) throw notFound();
  assertOwner(req, m.teacher_id);
  await q('DELETE FROM study_materials WHERE id=$1', [m.id]);
  res.json({ ok: true });
}));

// ---------- Quizzes ----------
const questionSchema = z.object({
  qtype: z.enum(['mcq', 'true_false', 'short_answer']), prompt: str(2000),
  options: z.array(z.string().trim().min(1).max(500)).max(8).optional(), correctOption: z.coerce.number().int().min(0).optional().nullable(),
  correctBool: z.boolean().optional().nullable(), answerKey: optStr(2000).optional(), marks: z.coerce.number().positive().max(100).default(1),
});
const quizSchema = z.object({
  sectionId: id, subjectId: id, title: str(200), instructions: optStr(3000),
  timeLimitMin: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().max(300).nullable()),
  availableFrom: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().datetime({ offset: true }).nullable().optional()),
  availableUntil: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().datetime({ offset: true }).nullable().optional()),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(1), showResults: bool.default(true),
  questions: z.array(questionSchema).min(1).max(100),
});
function validateQuestions(qs: z.infer<typeof questionSchema>[]) {
  qs.forEach((x, i) => {
    if (x.qtype === 'mcq') {
      if (!x.options || x.options.length < 2) throw badRequest(`Question ${i + 1}: add at least two options.`);
      if (x.correctOption == null || x.correctOption >= x.options.length) throw badRequest(`Question ${i + 1}: choose the correct option.`);
    }
    if (x.qtype === 'true_false' && typeof x.correctBool !== 'boolean') throw badRequest(`Question ${i + 1}: choose True or False as the answer.`);
  });
}
async function saveQuestions(c: any, quizId: number, qs: z.infer<typeof questionSchema>[]) {
  await c.query('DELETE FROM quiz_questions WHERE quiz_id=$1', [quizId]);
  let i = 0;
  for (const x of qs) {
    await c.query(`INSERT INTO quiz_questions (quiz_id, qtype, prompt, options, correct_option, correct_bool, answer_key, marks, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [quizId, x.qtype, x.prompt, x.qtype === 'mcq' ? JSON.stringify(x.options) : x.qtype === 'true_false' ? JSON.stringify(['True', 'False']) : null,
        x.qtype === 'mcq' ? x.correctOption : null, x.qtype === 'true_false' ? x.correctBool : null, x.qtype === 'short_answer' ? x.answerKey ?? null : null, x.marks, i++]);
  }
}
learningRouter.get('/quizzes', ah(async (req, res) => {
  const f = z.object({ sectionId: optId.optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  if (f.sectionId) await assertSectionAccess(req, f.sectionId);
  const tid = req.user!.role === 'teacher' ? req.user!.teacherId : null;
  res.json(await q(
    `SELECT qz.*, sub.name AS subject_name, cl.name AS class_name, s.name AS section_name,
            (SELECT count(*) FROM quiz_questions x WHERE x.quiz_id = qz.id) AS questions,
            (SELECT count(*) FROM quiz_attempts x WHERE x.quiz_id = qz.id AND x.status <> 'in_progress') AS attempts,
            (SELECT count(*) FROM quiz_attempts x WHERE x.quiz_id = qz.id AND x.status = 'pending_review') AS pending_review
       FROM quizzes qz JOIN subjects sub ON sub.id = qz.subject_id JOIN sections s ON s.id = qz.section_id JOIN class_levels cl ON cl.id = s.class_level_id
      WHERE ($1::bigint IS NULL OR qz.section_id = $1) AND ($2::bigint IS NULL OR qz.teacher_id = $2) ORDER BY qz.created_at DESC LIMIT 300`,
    [f.sectionId ?? null, f.sectionId ? null : tid]));
}));
learningRouter.post('/quizzes', ah(async (req, res) => {
  const b = quizSchema.parse(req.body);
  validateQuestions(b.questions);
  const tid = await teacherIdFor(req, b.sectionId, b.subjectId);
  const out = await tx(async (c) => {
    const qz = await one(`INSERT INTO quizzes (section_id, subject_id, teacher_id, title, instructions, time_limit_min, available_from, available_until, max_attempts, show_results)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.sectionId, b.subjectId, tid, b.title, b.instructions, b.timeLimitMin, b.availableFrom ?? null, b.availableUntil ?? null, b.maxAttempts, b.showResults], c);
    await saveQuestions(c, qz.id, b.questions);
    await audit(req, 'quiz.create', 'quiz', qz.id, { sectionId: b.sectionId }, c);
    return qz;
  });
  res.status(201).json(out);
}));
learningRouter.get('/quizzes/:id', ah(async (req, res) => {
  const qz = await one('SELECT qz.*, sub.name AS subject_name FROM quizzes qz JOIN subjects sub ON sub.id = qz.subject_id WHERE qz.id=$1', [id.parse(req.params.id)]);
  if (!qz) throw notFound();
  await assertSectionAccess(req, qz.section_id);
  const questions = await q('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY sort_order', [qz.id]);
  const attempts = await q(
    `SELECT a.*, st.first_name, st.last_name, st.student_code FROM quiz_attempts a JOIN students st ON st.id = a.student_id WHERE a.quiz_id=$1 ORDER BY a.submitted_at DESC NULLS LAST`, [qz.id]);
  res.json({ ...qz, questions, attempts });
}));
learningRouter.put('/quizzes/:id', ah(async (req, res) => {
  const qid = id.parse(req.params.id);
  const cur = await one('SELECT * FROM quizzes WHERE id=$1', [qid]);
  if (!cur) throw notFound();
  assertOwner(req, cur.teacher_id);
  const b = quizSchema.omit({ sectionId: true, subjectId: true }).parse(req.body);
  validateQuestions(b.questions);
  await tx(async (c) => {
    const attempts = await one('SELECT count(*) AS n FROM quiz_attempts WHERE quiz_id=$1', [qid], c);
    await c.query(`UPDATE quizzes SET title=$2, instructions=$3, time_limit_min=$4, available_from=$5, available_until=$6, max_attempts=$7, show_results=$8 WHERE id=$1`,
      [qid, b.title, b.instructions, b.timeLimitMin, b.availableFrom ?? null, b.availableUntil ?? null, b.maxAttempts, b.showResults]);
    if (attempts.n > 0) return; // questions are frozen once students have attempted
    await saveQuestions(c, qid, b.questions);
  });
  res.json({ ok: true });
}));
learningRouter.post('/quizzes/:id/status', ah(async (req, res) => {
  const qid = id.parse(req.params.id);
  const { status } = z.object({ status: z.enum(['draft', 'published', 'closed']) }).parse(req.body);
  const cur = await one('SELECT * FROM quizzes WHERE id=$1', [qid]);
  if (!cur) throw notFound();
  assertOwner(req, cur.teacher_id);
  await q('UPDATE quizzes SET status=$2 WHERE id=$1', [qid, status]);
  await audit(req, 'quiz.status', 'quiz', qid, { status });
  res.json({ ok: true });
}));
learningRouter.get('/attempts/:id', ah(async (req, res) => {
  const a = await one('SELECT a.*, qz.section_id, qz.teacher_id, st.first_name, st.last_name FROM quiz_attempts a JOIN quizzes qz ON qz.id = a.quiz_id JOIN students st ON st.id = a.student_id WHERE a.id=$1', [id.parse(req.params.id)]);
  if (!a) throw notFound();
  await assertSectionAccess(req, a.section_id);
  const answers = await q(`SELECT qq.id AS question_id, qq.qtype, qq.prompt, qq.options, qq.correct_option, qq.correct_bool, qq.answer_key, qq.marks,
                                  x.answer, x.is_correct, x.awarded_marks, x.needs_review, x.feedback
                             FROM quiz_questions qq LEFT JOIN quiz_answers x ON x.question_id = qq.id AND x.attempt_id = $1
                            WHERE qq.quiz_id = $2 ORDER BY qq.sort_order`, [a.id, a.quiz_id]);
  res.json({ ...a, answers });
}));
learningRouter.post('/attempts/:id/grade', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const b = z.object({ answers: z.array(z.object({ questionId: id, awardedMarks: z.coerce.number().min(0), feedback: optStr(1000).optional() })).max(100), feedback: optStr(2000).optional() }).parse(req.body);
  await tx(async (c) => {
    const a = await one('SELECT a.*, qz.section_id, qz.subject_id FROM quiz_attempts a JOIN quizzes qz ON qz.id = a.quiz_id WHERE a.id=$1 FOR UPDATE OF a', [aid], c);
    if (!a) throw notFound();
    await assertSubjectAccess(req, a.section_id, a.subject_id);
    if (a.status === 'in_progress') throw badRequest('The student has not submitted this attempt yet.');
    for (const x of b.answers) {
      const qq = await one('SELECT marks, qtype FROM quiz_questions WHERE id=$1 AND quiz_id=$2', [x.questionId, a.quiz_id], c);
      if (!qq) throw badRequest('Unknown question.');
      if (qq.qtype !== 'short_answer') continue; // auto-graded questions are not overridden
      if (x.awardedMarks > qq.marks) throw badRequest(`Marks cannot exceed ${qq.marks} for a question.`);
      await c.query(`INSERT INTO quiz_answers (attempt_id, question_id, awarded_marks, is_correct, needs_review, feedback) VALUES ($1,$2,$3,$4,false,$5)
                     ON CONFLICT (attempt_id, question_id) DO UPDATE SET awarded_marks=EXCLUDED.awarded_marks, is_correct=EXCLUDED.is_correct, needs_review=false, feedback=EXCLUDED.feedback`,
        [aid, x.questionId, x.awardedMarks, x.awardedMarks >= qq.marks, x.feedback ?? null]);
    }
    if (b.feedback !== undefined) await c.query('UPDATE quiz_attempts SET feedback=$2 WHERE id=$1', [aid, b.feedback]);
    await gradeAttempt(c, aid);
  });
  res.json({ ok: true });
}));
