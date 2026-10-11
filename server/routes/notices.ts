import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { ah, forbidden, notFound } from '../lib/errors.js';
import { assertSectionAccess, can, requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, date, id, optDate, optId, optStr, str } from '../lib/validate.js';

export const noticesRouter = Router();

/** Notices visible to the current user. */
export async function feedFor(req: Request, limit = 30) {
  const u = req.user!;
  if (u.role === 'student') {
    const e = await one(`SELECT e.section_id, e.residency FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current WHERE e.student_id=$1`, [u.studentId]);
    return q(`SELECT n.*, u.display_name AS author FROM notices n LEFT JOIN users u ON u.id = n.created_by
               WHERE n.publish_at <= now() AND (n.expires_at IS NULL OR n.expires_at > now())
                 AND (n.audience IN ('public','all','students') OR (n.audience = 'section' AND n.section_id = $1) OR (n.audience = 'hostel' AND $2))
               ORDER BY n.pinned DESC, n.publish_at DESC LIMIT $3`, [e?.section_id ?? -1, e?.residency === 'hostel', limit]);
  }
  const isAdmin = u.role === 'admin';
  return q(`SELECT n.*, u.display_name AS author, cl.name AS class_name, s.name AS section_name FROM notices n LEFT JOIN users u ON u.id = n.created_by
              LEFT JOIN sections s ON s.id = n.section_id LEFT JOIN class_levels cl ON cl.id = s.class_level_id
             WHERE n.publish_at <= now() AND (n.expires_at IS NULL OR n.expires_at > now())
               AND ($1 OR n.audience IN ('public','all','staff','teachers','hostel')
                    OR (n.audience = 'section' AND (n.section_id IN (SELECT id FROM sections WHERE class_teacher_id = $2) OR n.section_id IN (SELECT section_id FROM teaching_assignments WHERE teacher_id = $2))))
             ORDER BY n.pinned DESC, n.publish_at DESC LIMIT $3`, [isAdmin, u.teacherId ?? -1, limit]);
}
noticesRouter.get('/', ah(async (req, res) => res.json(await feedFor(req, 100))));

noticesRouter.get('/manage', ah(async (req, res) => {
  const u = req.user!;
  if (!can(req, 'notices.manage') && u.role !== 'teacher') throw forbidden();
  res.json(await q(`SELECT n.*, u.display_name AS author, cl.name AS class_name, s.name AS section_name FROM notices n LEFT JOIN users u ON u.id = n.created_by
                     LEFT JOIN sections s ON s.id = n.section_id LEFT JOIN class_levels cl ON cl.id = s.class_level_id
                     WHERE $1 OR n.created_by = $2 ORDER BY n.publish_at DESC LIMIT 500`, [can(req, 'notices.manage'), u.id]));
}));
const noticeSchema = z.object({
  title: str(200), titleHi: optStr(200), body: str(10000), bodyHi: optStr(10000),
  audience: z.enum(['public', 'all', 'staff', 'teachers', 'students', 'section', 'hostel']), sectionId: optId, pinned: bool.default(false),
  publishAt: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().datetime({ offset: true }).optional()),
  expiresAt: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().datetime({ offset: true }).nullable().optional()),
  attachmentFileId: z.string().uuid().nullable().optional(),
});
async function checkNoticeRights(req: Request, b: z.infer<typeof noticeSchema>) {
  if (b.audience === 'section' && !b.sectionId) throw forbidden('Choose a section.');
  if (can(req, 'notices.manage')) return;
  if (req.user!.role !== 'teacher' || b.audience !== 'section') throw forbidden('Teachers can post notices only to their own sections.');
  await assertSectionAccess(req, b.sectionId!);
  if (b.pinned) throw forbidden('Only the office can pin notices.');
}
noticesRouter.post('/', ah(async (req, res) => {
  const b = noticeSchema.parse(req.body);
  await checkNoticeRights(req, b);
  const n = await one(`INSERT INTO notices (title, title_hi, body, body_hi, audience, section_id, pinned, publish_at, expires_at, attachment_file_id, created_by)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9,$10,$11) RETURNING *`,
    [b.title, b.titleHi, b.body, b.bodyHi, b.audience, b.audience === 'section' ? b.sectionId : null, b.pinned, b.publishAt ?? null, b.expiresAt ?? null, b.attachmentFileId ?? null, req.user!.id]);
  await audit(req, 'notice.create', 'notice', n.id, { audience: b.audience });
  res.status(201).json(n);
}));
noticesRouter.put('/:id', ah(async (req, res) => {
  const nid = id.parse(req.params.id);
  const cur = await one('SELECT * FROM notices WHERE id=$1', [nid]);
  if (!cur) throw notFound();
  if (!can(req, 'notices.manage') && cur.created_by !== req.user!.id) throw forbidden();
  const b = noticeSchema.parse(req.body);
  await checkNoticeRights(req, b);
  const n = await one(`UPDATE notices SET title=$2, title_hi=$3, body=$4, body_hi=$5, audience=$6, section_id=$7, pinned=$8, publish_at=coalesce($9::timestamptz, publish_at), expires_at=$10, attachment_file_id=$11
                        WHERE id=$1 RETURNING *`,
    [nid, b.title, b.titleHi, b.body, b.bodyHi, b.audience, b.audience === 'section' ? b.sectionId : null, b.pinned, b.publishAt ?? null, b.expiresAt ?? null, b.attachmentFileId ?? null]);
  await audit(req, 'notice.update', 'notice', nid);
  res.json(n);
}));
noticesRouter.delete('/:id', ah(async (req, res) => {
  const nid = id.parse(req.params.id);
  const cur = await one('SELECT * FROM notices WHERE id=$1', [nid]);
  if (!cur) throw notFound();
  if (!can(req, 'notices.manage') && cur.created_by !== req.user!.id) throw forbidden();
  await pool.query('DELETE FROM notices WHERE id=$1', [nid]);
  await audit(req, 'notice.delete', 'notice', nid, { title: cur.title });
  res.json({ ok: true });
}));

// ---------- Events / academic calendar ----------
noticesRouter.get('/events/list', ah(async (req, res) => {
  const f = z.object({ from: optDate.optional(), to: optDate.optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  res.json(await q(`SELECT * FROM events WHERE ($1::date IS NULL OR coalesce(end_date, start_date) >= $1) AND ($2::date IS NULL OR start_date <= $2) ORDER BY start_date LIMIT 500`,
    [f.from ?? null, f.to ?? null]));
}));
const eventSchema = z.object({ title: str(200), titleHi: optStr(200), description: optStr(3000), eventType: z.enum(['event', 'holiday', 'exam', 'meeting', 'activity']),
  startDate: date, endDate: optDate, location: optStr(200), isPublic: bool.default(true) });
noticesRouter.post('/events', requirePerm('notices.manage'), ah(async (req, res) => {
  const b = eventSchema.parse(req.body);
  const e = await one(`INSERT INTO events (title, title_hi, description, event_type, start_date, end_date, location, is_public, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.title, b.titleHi, b.description, b.eventType, b.startDate, b.endDate, b.location, b.isPublic, req.user!.id]);
  await audit(req, 'event.create', 'event', e.id);
  res.status(201).json(e);
}));
noticesRouter.put('/events/:id', requirePerm('notices.manage'), ah(async (req, res) => {
  const b = eventSchema.parse(req.body);
  const e = await one(`UPDATE events SET title=$2, title_hi=$3, description=$4, event_type=$5, start_date=$6, end_date=$7, location=$8, is_public=$9 WHERE id=$1 RETURNING *`,
    [id.parse(req.params.id), b.title, b.titleHi, b.description, b.eventType, b.startDate, b.endDate, b.location, b.isPublic]);
  if (!e) throw notFound();
  res.json(e);
}));
noticesRouter.delete('/events/:id', requirePerm('notices.manage'), ah(async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1', [id.parse(req.params.id)]);
  await audit(req, 'event.delete', 'event', req.params.id);
  res.json({ ok: true });
}));

// ---------- Admission enquiries ----------
noticesRouter.get('/enquiries/list', requirePerm('students.manage'), ah(async (req, res) => {
  const status = z.enum(['new', 'contacted', 'admitted', 'closed', 'all']).default('all').parse(req.query.status || undefined);
  res.json(await q(`SELECT * FROM admission_enquiries WHERE $1 = 'all' OR status = $1 ORDER BY created_at DESC LIMIT 1000`, [status]));
}));
noticesRouter.put('/enquiries/:id', requirePerm('students.manage'), ah(async (req, res) => {
  const b = z.object({ status: z.enum(['new', 'contacted', 'admitted', 'closed']), notes: optStr(2000) }).parse(req.body);
  const r = await one('UPDATE admission_enquiries SET status=$2, notes=$3 WHERE id=$1 RETURNING *', [id.parse(req.params.id), b.status, b.notes]);
  if (!r) throw notFound();
  res.json(r);
}));
