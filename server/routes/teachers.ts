import { Router } from 'express';
import { z } from 'zod';
import { one, pool, q, tx } from '../db/pool.js';
import { ah, notFound } from '../lib/errors.js';
import { requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, date, email, id, optDate, optStr, phone, str } from '../lib/validate.js';
import { hashPassword, tempPassword } from '../lib/passwords.js';
import { nextCounter, pad } from '../lib/counters.js';
import { settings } from '../lib/context.js';
import { todayIST } from '../lib/dates.js';

export const teachersRouter = Router();

const teacherSchema = z.object({
  firstName: str(80), lastName: optStr(80), gender: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.enum(['male', 'female', 'other']).nullable()),
  dob: optDate, phone, email, address: optStr(500), qualification: optStr(300),
  experienceYears: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(60).nullable()),
  designation: optStr(80), joiningDate: optDate, photoFileId: z.string().uuid().nullable().optional(),
});

teachersRouter.get('/', requirePerm('teachers.manage', 'students.view_all', 'reports.view'), ah(async (req, res) => {
  const status = z.enum(['active', 'inactive', 'left', 'all']).default('active').parse(req.query.status || undefined);
  res.json(await q(
    `SELECT t.id, t.employee_code, t.first_name, t.last_name, t.phone, t.email, t.qualification, t.designation, t.joining_date, t.status,
            t.photo_file_id, u.username, u.is_active AS login_active, u.last_login_at,
            COALESCE((SELECT string_agg(DISTINCT sub.name, ', ') FROM teaching_assignments ta JOIN subjects sub ON sub.id = ta.subject_id
                       JOIN sections s ON s.id = ta.section_id JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
                      WHERE ta.teacher_id = t.id), '') AS subjects,
            (SELECT count(*) FROM teaching_assignments ta JOIN sections s ON s.id = ta.section_id JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
              WHERE ta.teacher_id = t.id) AS assignment_count,
            COALESCE((SELECT string_agg(cl.name || '-' || s.name, ', ') FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id
                       JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current WHERE s.class_teacher_id = t.id), '') AS class_teacher_of
       FROM teachers t LEFT JOIN users u ON u.id = t.user_id
      WHERE ($1 = 'all' OR t.status = $1) ORDER BY t.first_name, t.last_name`, [status]));
}));

teachersRouter.get('/attendance', requirePerm('teachers.manage'), ah(async (req, res) => {
  const d = date.parse(req.query.date || todayIST());
  res.json(await q(
    `SELECT t.id AS teacher_id, t.employee_code, t.first_name, t.last_name, a.status, a.remarks
       FROM teachers t LEFT JOIN teacher_attendance a ON a.teacher_id = t.id AND a.date = $1
      WHERE t.status = 'active' ORDER BY t.first_name`, [d]));
}));
teachersRouter.post('/attendance', requirePerm('teachers.manage'), ah(async (req, res) => {
  const b = z.object({ date, entries: z.array(z.object({ teacherId: id, status: z.enum(['present', 'absent', 'late', 'half_day', 'leave']), remarks: optStr(200).optional() })).max(500) }).parse(req.body);
  await tx(async (c) => {
    for (const e of b.entries) {
      await c.query(
        `INSERT INTO teacher_attendance (teacher_id, date, status, remarks, marked_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (teacher_id, date) DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, marked_at = now()`,
        [e.teacherId, b.date, e.status, e.remarks ?? null, req.user!.id]);
    }
    await audit(req, 'teacher_attendance.save', 'teacher_attendance', b.date, { count: b.entries.length }, c);
  });
  res.json({ ok: true });
}));

teachersRouter.get('/:id', requirePerm('teachers.manage'), ah(async (req, res) => {
  const tid = id.parse(req.params.id);
  const t = await one(`SELECT t.*, u.username, u.is_active AS login_active, u.last_login_at, u.must_change_password FROM teachers t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1`, [tid]);
  if (!t) throw notFound();
  const [assignments, classTeacher, attendance] = await Promise.all([
    q(`SELECT ta.id, ta.section_id, ta.subject_id, sub.name AS subject, cl.name AS class_name, s.name AS section, y.name AS year, y.is_current
         FROM teaching_assignments ta JOIN subjects sub ON sub.id = ta.subject_id JOIN sections s ON s.id = ta.section_id
         JOIN class_levels cl ON cl.id = s.class_level_id JOIN academic_years y ON y.id = s.academic_year_id
        WHERE ta.teacher_id = $1 ORDER BY y.start_date DESC, cl.sort_order, s.name, sub.name`, [tid]),
    q(`SELECT s.id, cl.name AS class_name, s.name AS section, y.name AS year FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id
         JOIN academic_years y ON y.id = s.academic_year_id WHERE s.class_teacher_id = $1 ORDER BY y.start_date DESC`, [tid]),
    one(`SELECT count(*) FILTER (WHERE status IN ('present','late')) AS present, count(*) FILTER (WHERE status='half_day') AS half_day,
                count(*) FILTER (WHERE status='absent') AS absent, count(*) FILTER (WHERE status='leave') AS leave, count(*) AS total
           FROM teacher_attendance WHERE teacher_id = $1 AND date >= CURRENT_DATE - 365`, [tid]),
  ]);
  res.json({ ...t, assignments, classTeacher, attendance });
}));

teachersRouter.post('/', requirePerm('teachers.manage'), ah(async (req, res) => {
  const b = teacherSchema.extend({ isDemo: bool.optional() }).parse(req.body);
  const s = await settings();
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  const out = await tx(async (c) => {
    const n = await nextCounter(c, 'teacher_code');
    const code = `${s.teacher_id_prefix}${pad(n, 4)}`;
    const name = [b.firstName, b.lastName].filter(Boolean).join(' ');
    const u = await one(`INSERT INTO users (username, password_hash, role, display_name, email, is_demo) VALUES ($1,$2,'teacher',$3,$4,$5) RETURNING id`,
      [code, hash, name, b.email, !!b.isDemo], c);
    const t = await one(
      `INSERT INTO teachers (user_id, employee_code, first_name, last_name, gender, dob, phone, email, address, qualification, experience_years, designation, joining_date, photo_file_id, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [u.id, code, b.firstName, b.lastName, b.gender, b.dob, b.phone, b.email, b.address, b.qualification, b.experienceYears, b.designation, b.joiningDate ?? todayIST(), b.photoFileId ?? null, !!b.isDemo], c);
    await audit(req, 'teacher.create', 'teacher', t.id, { employeeCode: code }, c);
    return t;
  });
  res.status(201).json({ teacher: out, username: out.employee_code, temporaryPassword: pw });
}));

teachersRouter.put('/:id', requirePerm('teachers.manage'), ah(async (req, res) => {
  const tid = id.parse(req.params.id);
  const b = teacherSchema.parse(req.body);
  const t = await one(
    `UPDATE teachers SET first_name=$2, last_name=$3, gender=$4, dob=$5, phone=$6, email=$7, address=$8, qualification=$9, experience_years=$10,
            designation=$11, joining_date=coalesce($12, joining_date), photo_file_id=$13, updated_at=now() WHERE id=$1 RETURNING *`,
    [tid, b.firstName, b.lastName, b.gender, b.dob, b.phone, b.email, b.address, b.qualification, b.experienceYears, b.designation, b.joiningDate, b.photoFileId ?? null]);
  if (!t) throw notFound();
  await pool.query('UPDATE users SET display_name=$2, email=$3 WHERE id=$1', [t.user_id, [b.firstName, b.lastName].filter(Boolean).join(' '), b.email]);
  await audit(req, 'teacher.update', 'teacher', tid, b);
  res.json(t);
}));

teachersRouter.post('/:id/status', requirePerm('teachers.manage'), ah(async (req, res) => {
  const tid = id.parse(req.params.id);
  const { status } = z.object({ status: z.enum(['active', 'inactive', 'left']) }).parse(req.body);
  const t = await one('UPDATE teachers SET status=$2, updated_at=now() WHERE id=$1 RETURNING user_id', [tid, status]);
  if (!t) throw notFound();
  await pool.query('UPDATE users SET is_active=$2 WHERE id=$1', [t.user_id, status === 'active']);
  if (status !== 'active') await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(t.user_id)]);
  await audit(req, 'teacher.status', 'teacher', tid, { status });
  res.json({ ok: true });
}));

teachersRouter.post('/:id/reset-password', requirePerm('teachers.manage'), ah(async (req, res) => {
  const tid = id.parse(req.params.id);
  const t = await one('SELECT user_id FROM teachers WHERE id=$1', [tid]);
  if (!t) throw notFound();
  const pw = tempPassword();
  const u = await one('UPDATE users SET password_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL WHERE id=$1 RETURNING username', [t.user_id, await hashPassword(pw)]);
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(t.user_id)]);
  await audit(req, 'teacher.password_reset', 'teacher', tid);
  res.json({ username: u.username, temporaryPassword: pw });
}));
