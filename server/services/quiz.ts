import type { Db } from '../db/pool.js';
import { one, q } from '../db/pool.js';

/** Grade an attempt: MCQ and true/false are graded automatically; short answers wait for teacher review. */
export async function gradeAttempt(c: Db, attemptId: number) {
  const qs = await q('SELECT * FROM quiz_questions WHERE quiz_id = (SELECT quiz_id FROM quiz_attempts WHERE id = $1)', [attemptId], c);
  const answers = await q('SELECT * FROM quiz_answers WHERE attempt_id = $1', [attemptId], c);
  let score = 0, max = 0, pending = false;
  for (const qq of qs) {
    max += qq.marks;
    const a = answers.find((x) => x.question_id === qq.id);
    if (qq.qtype === 'short_answer') {
      if (a && a.awarded_marks != null && !a.needs_review) { score += a.awarded_marks; continue; }
      if (a && a.answer != null && String(a.answer.value ?? '').trim() !== '') {
        await c.query('UPDATE quiz_answers SET needs_review = true WHERE id = $1 AND awarded_marks IS NULL', [a.id]);
        pending = true;
      } else if (a) {
        await c.query('UPDATE quiz_answers SET is_correct=false, awarded_marks=0, needs_review=false WHERE id=$1', [a.id]);
      }
      continue;
    }
    const v = a?.answer?.value;
    const correct = qq.qtype === 'mcq' ? v !== undefined && Number(v) === qq.correct_option : v !== undefined && v === qq.correct_bool;
    const awarded = correct ? qq.marks : 0;
    score += awarded;
    if (a) await c.query('UPDATE quiz_answers SET is_correct=$2, awarded_marks=$3, needs_review=false WHERE id=$1', [a.id, correct, awarded]);
    else await c.query('INSERT INTO quiz_answers (attempt_id, question_id, answer, is_correct, awarded_marks) VALUES ($1,$2,NULL,false,0)', [attemptId, qq.id]);
  }
  await c.query(`UPDATE quiz_attempts SET status=$2, score=$3, max_score=$4, submitted_at=coalesce(submitted_at, now()) WHERE id=$1`,
    [attemptId, pending ? 'pending_review' : 'graded', score, max]);
  return { score, max, pending };
}

export async function quizForStudent(c: Db, quizId: number, studentId: number) {
  return one(
    `SELECT qz.* FROM quizzes qz JOIN enrollments e ON e.section_id = qz.section_id AND e.student_id = $2 AND e.status = 'active'
       JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current WHERE qz.id = $1 AND qz.status IN ('published','closed')`, [quizId, studentId], c);
}
