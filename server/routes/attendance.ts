import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { assertSectionAccess, assertStudentAccess, can, requirePerm } from '../middleware/auth.js';
import { date, id, optDate, optStr } from '../lib/validate.js';
import { settings } from '../lib/context.js';
import { daysBetween, todayIST } from '../lib/dates.js';
import { PCT_SQL } from '../lib/sql.js';

export const attendanceRouter = Router();

const STATUS = z.enum(['present', 'absent', 'late', 'half_day', 'leave']);
const SESSION = z.enum(['full_day', 'morning', 'afternoon']).default('full_day');

async function editPolicy(req: Express.Request & { user?: any }, d: string) {
  const today = todayIST();
  if (d > today) return { canEdit: false, reason: 'Attendance cannot be marked for a future date.' };
  if (can(req as any, 'attendance.correct_any')) return { canEdit: true, reason: null };
  const s = await settings();
  if (daysBetween(d, today) > s.attendance_edit_window_days) {
    return { canEdit: false, reason: `Attendance older than ${s.attendance_edit_window_days} day(s) can only be corrected by the Principal.` };
  }
  return { canEdit: true, reason: null };
}

attendanceRouter.get('/sheet', ah(async (req, res) => {
  const f = z.object({ sectionId: id, date, session: SESSION }).parse(req.query);
  await assertSectionAccess(req, f.sectionId);
  const sec = await one(`SELECT s.id, s.name, cl.name AS class_name, s.academic_year_id FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id WHERE s.id = $1`, [f.sectionId]);
  if (!sec) throw notFound();
  const rows = await q(
    `SELECT e.id AS enrollment_id, e.roll_no, st.id AS student_id, st.first_name, st.last_name, st.student_code, st.photo_file_id,
            a.status, a.remarks, a.marked_at, a.updated_at, u.display_name AS marked_by_name
       FROM enrollments e JOIN students st ON st.id = e.student_id
       LEFT JOIN attendance_records a ON a.student_id = st.id AND a.date = $2 AND a.session = $3
       LEFT JOIN users u ON u.id = coalesce(a.updated_by, a.marked_by)
      WHERE e.section_id = $1 AND (e.status = 'active' OR (e.left_on IS NOT NULL AND e.left_on >= $2)) AND e.enrolled_on <= $2
      ORDER BY e.roll_no`, [f.sectionId, f.date, f.session]);
  const policy = await editPolicy(req, f.date);
  res.json({ section: sec, date: f.date, session: f.session, students: rows, alreadyMarked: rows.some((r) => r.status), ...policy });
}));

attendanceRouter.post('/sheet', ah(async (req, res) => {
  const b = z.object({
    sectionId: id, date, session: SESSION,
    entries: z.array(z.object({ studentId: id, status: STATUS, remarks: optStr(200).optional() })).min(1).max(200),
    correctionReason: optStr(300).optional(),
  }).parse(req.body);
  await assertSectionAccess(req, b.sectionId);
  const u = req.user!;
  if (u.role !== 'admin' && u.role !== 'teacher' && !can(req, 'attendance.correct_any')) throw forbidden();
  const policy = await editPolicy(req, b.date);
  if (!policy.canEdit) throw forbidden(policy.reason!);
  const result = await tx(async (c) => {
    const valid = new Map((await c.query(
      `SELECT student_id, id FROM enrollments WHERE section_id = $1 AND (status = 'active' OR (left_on IS NOT NULL AND left_on >= $2)) AND enrolled_on <= $2`,
      [b.sectionId, b.date])).rows.map((r) => [Number(r.student_id), Number(r.id)]));
    let created = 0, changed = 0;
    for (const e of b.entries) {
      const enrollmentId = valid.get(e.studentId);
      if (!enrollmentId) throw badRequest('One or more students are not enrolled in this section on that date.');
      const prev = await one('SELECT id, status, remarks FROM attendance_records WHERE student_id=$1 AND date=$2 AND session=$3 FOR UPDATE', [e.studentId, b.date, b.session], c);
      if (!prev) {
        await c.query(
          `INSERT INTO attendance_records (student_id, enrollment_id, section_id, date, session, status, remarks, marked_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [e.studentId, enrollmentId, b.sectionId, b.date, b.session, e.status, e.remarks ?? null, u.id]);
        created++;
      } else if (prev.status !== e.status || (prev.remarks ?? null) !== (e.remarks ?? null)) {
        await c.query('UPDATE attendance_records SET status=$2, remarks=$3, updated_by=$4, updated_at=now() WHERE id=$1', [prev.id, e.status, e.remarks ?? null, u.id]);
        await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip) VALUES ($1,'attendance.correct','attendance',$2,$3,$4)`,
          [u.id, String(prev.id), JSON.stringify({ studentId: e.studentId, date: b.date, from: prev.status, to: e.status, reason: b.correctionReason ?? null }), req.ip]);
        changed++;
      }
    }
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip) VALUES ($1,'attendance.save','section',$2,$3,$4)`,
      [u.id, String(b.sectionId), JSON.stringify({ date: b.date, session: b.session, created, changed }), req.ip]);
    return { created, changed };
  });
  res.json(result);
}));

/** Per-student summary for a section and date range. */
attendanceRouter.get('/summary', ah(async (req, res) => {
  const f = z.object({ sectionId: id, from: optDate, to: optDate }).parse(req.query);
  await assertSectionAccess(req, f.sectionId);
  res.json(await q(
    `SELECT e.student_id, e.roll_no, st.first_name, st.last_name, st.student_code,
            count(a.id) AS total, count(*) FILTER (WHERE a.status = 'present') AS present, count(*) FILTER (WHERE a.status = 'late') AS late,
            count(*) FILTER (WHERE a.status = 'half_day') AS half_day, count(*) FILTER (WHERE a.status = 'absent') AS absent,
            count(*) FILTER (WHERE a.status = 'leave') AS leave, ${PCT_SQL} AS percent
       FROM enrollments e JOIN students st ON st.id = e.student_id
       LEFT JOIN attendance_records a ON a.enrollment_id = e.id AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3)
      WHERE e.section_id = $1 GROUP BY e.student_id, e.roll_no, st.first_name, st.last_name, st.student_code ORDER BY e.roll_no`,
    [f.sectionId, f.from, f.to]));
}));

/** Month grid for a section: one row per student, one column per day. */
attendanceRouter.get('/monthly', ah(async (req, res) => {
  const f = z.object({ sectionId: id, month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
  await assertSectionAccess(req, f.sectionId);
  const rows = await q(
    `SELECT a.student_id, extract(day from a.date)::int AS day, a.status FROM attendance_records a
      WHERE a.section_id = $1 AND to_char(a.date, 'YYYY-MM') = $2 AND a.session = 'full_day'`, [f.sectionId, f.month]);
  const students = await q(`SELECT e.student_id, e.roll_no, st.first_name, st.last_name FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.section_id = $1 ORDER BY e.roll_no`, [f.sectionId]);
  res.json({ students, records: rows });
}));

/** School-wide daily view: which sections have marked attendance and their counts. */
attendanceRouter.get('/daily', requirePerm('attendance.view_all'), ah(async (req, res) => {
  const d = date.parse(req.query.date || todayIST());
  res.json(await q(
    `SELECT s.id AS section_id, cl.name AS class_name, s.name AS section_name, cl.sort_order,
            (SELECT count(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') AS enrolled,
            count(a.id) AS marked, count(*) FILTER (WHERE a.status IN ('present','late')) AS present,
            count(*) FILTER (WHERE a.status = 'absent') AS absent, count(*) FILTER (WHERE a.status = 'half_day') AS half_day,
            count(*) FILTER (WHERE a.status = 'leave') AS leave
       FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
       LEFT JOIN attendance_records a ON a.section_id = s.id AND a.date = $1 AND a.session = 'full_day'
      WHERE s.is_active GROUP BY s.id, cl.name, s.name, cl.sort_order ORDER BY cl.sort_order, s.name`, [d]));
}));

attendanceRouter.get('/daily/:sectionId/absentees', requirePerm('attendance.view_all'), ah(async (req, res) => {
  const d = date.parse(req.query.date || todayIST());
  res.json(await q(
    `SELECT st.id, st.first_name, st.last_name, e.roll_no, a.status, a.remarks FROM attendance_records a JOIN students st ON st.id = a.student_id
       JOIN enrollments e ON e.id = a.enrollment_id WHERE a.section_id = $1 AND a.date = $2 AND a.status <> 'present' ORDER BY e.roll_no`,
    [id.parse(req.params.sectionId), d]));
}));

/** A single student's history (student themselves, their teachers, or office). */
attendanceRouter.get('/student/:id', ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  await assertStudentAccess(req, sid);
  const f = z.object({ from: optDate, to: optDate, yearId: z.coerce.number().int().positive().optional() }).parse(req.query);
  const records = await q(
    `SELECT a.date, a.session, a.status, a.remarks FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id
      WHERE a.student_id = $1 AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3)
        AND ($4::bigint IS NULL OR e.academic_year_id = $4) ORDER BY a.date DESC LIMIT 400`, [sid, f.from, f.to, f.yearId ?? null]);
  const monthly = await q(
    `SELECT to_char(a.date, 'YYYY-MM') AS month, count(*) AS total, count(*) FILTER (WHERE a.status IN ('present','late')) AS present,
            count(*) FILTER (WHERE a.status = 'absent') AS absent, count(*) FILTER (WHERE a.status = 'half_day') AS half_day,
            count(*) FILTER (WHERE a.status = 'leave') AS leave, ${PCT_SQL} AS percent
       FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id
      WHERE a.student_id = $1 AND ($2::bigint IS NULL OR e.academic_year_id = $2) GROUP BY 1 ORDER BY 1`, [sid, f.yearId ?? null]);
  const overall = await one(
    `SELECT count(*) AS total, count(*) FILTER (WHERE a.status IN ('present','late')) AS present, count(*) FILTER (WHERE a.status = 'absent') AS absent,
            count(*) FILTER (WHERE a.status = 'half_day') AS half_day, count(*) FILTER (WHERE a.status = 'leave') AS leave, ${PCT_SQL} AS percent
       FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id
      WHERE a.student_id = $1 AND e.academic_year_id = coalesce($2::bigint, (SELECT id FROM academic_years WHERE is_current))`,
    [sid, f.yearId ?? null]);
  res.json({ records, monthly, overall });
}));
