import { Router } from 'express';
import { z } from 'zod';
import { one, pool, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { bool, date, email, id, optDate, optStr, str } from '../lib/validate.js';
import { GRANTABLE, PERMISSIONS } from '../lib/permissions.js';
import { assertAdminSetPassword, hashPassword, tempPassword } from '../lib/passwords.js';
import { settings } from '../lib/context.js';

export const settingsRouter = Router();

// ---------- School profile ----------
const schoolSchema = z.object({
  name: str(200), nameHi: optStr(200), tagline: optStr(300), taglineHi: optStr(300),
  logoFileId: z.string().uuid().nullable().optional(), heroImageFileId: z.string().uuid().nullable().optional(),
  address: optStr(500), city: optStr(100), state: optStr(100), pincode: optStr(12), phone: optStr(40), email,
  website: optStr(200), mapUrl: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().url().max(500).nullable()),
  establishedYear: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1800).max(2100).nullable()),
  principalName: optStr(120), about: optStr(5000), aboutHi: optStr(5000), mission: optStr(3000), missionHi: optStr(3000),
  receiptPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/), invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/),
  studentIdPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/), teacherIdPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/),
  admissionPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/),
  defaultLanguage: z.enum(['en', 'hi']), allowAdmissionNoLogin: bool, allowRollLogin: bool, showFeesToStudents: bool,
  attendanceEditWindowDays: z.coerce.number().int().min(0).max(60),
  publicStatsMode: z.enum(['auto', 'manual', 'hidden']),
  publicStudentsCount: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
  publicTeachersCount: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
  publicClassesCount: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
  publicYearsExperience: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
  enquiryEnabled: bool, schoolHours: optStr(120), schoolHoursHi: optStr(120),
});
const snake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());

settingsRouter.get('/school', ah(async (req, res) => {
  const s = await settings();
  if (req.user!.role === 'student') {
    return res.json({ name: s.name, name_hi: s.name_hi, logo_file_id: s.logo_file_id, show_fees_to_students: s.show_fees_to_students });
  }
  res.json(s);
}));
settingsRouter.put('/school', requirePerm('settings.manage'), ah(async (req, res) => {
  const b = schoolSchema.partial().parse(req.body);
  const keys = Object.keys(b).filter((k) => (b as any)[k] !== undefined);
  if (keys.length) {
    await pool.query(`UPDATE school_settings SET ${keys.map((k, i) => `${snake(k)} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`,
      keys.map((k) => (b as any)[k]));
  }
  await audit(req, 'settings.update', 'school_settings', 1, b);
  res.json(await settings());
}));

// ---------- Lookups used throughout the UI ----------
settingsRouter.get('/lookups', ah(async (req, res) => {
  const staff = req.user!.role !== 'student' && req.user!.role !== 'parent';
  const [years, classes, boards, mediums, subjects, sections, categories, routes, terms, scales, domains] = await Promise.all([
    q('SELECT id, name, start_date, end_date, is_current, status FROM academic_years ORDER BY start_date DESC'),
    q('SELECT id, name, name_hi, code, sort_order, is_preschool, is_active FROM class_levels ORDER BY sort_order'),
    q('SELECT id, code, name, is_active FROM boards ORDER BY id'),
    q('SELECT id, code, name, is_active FROM mediums ORDER BY id'),
    q('SELECT id, name, name_hi, code, is_active FROM subjects ORDER BY name'),
    staff ? q(`SELECT s.id, s.academic_year_id, s.class_level_id, s.name, cl.name AS class_name, cl.is_preschool, cl.sort_order,
                      b.code AS board, m.code AS medium, s.class_teacher_id, s.capacity, s.room, s.board_id, s.medium_id, s.is_active
                 FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id
                 LEFT JOIN boards b ON b.id = s.board_id LEFT JOIN mediums m ON m.id = s.medium_id
                ORDER BY cl.sort_order, s.name`) : Promise.resolve([]),
    staff ? q('SELECT id, code, name, name_hi, kind, default_frequency, is_active FROM fee_categories ORDER BY id') : Promise.resolve([]),
    staff ? q('SELECT id, name, monthly_fee_paise, is_active FROM transport_routes ORDER BY name') : Promise.resolve([]),
    q('SELECT id, academic_year_id, name, start_date, end_date FROM terms ORDER BY start_date NULLS LAST, id'),
    q('SELECT id, name, is_default FROM grading_scales ORDER BY id'),
    q('SELECT id, name, name_hi, sort_order, is_active FROM assessment_domains ORDER BY sort_order'),
  ]);
  res.json({ years, classes, boards, mediums, subjects, sections, categories, routes, terms, scales, domains });
}));

// ---------- Academic years ----------
const yearSchema = z.object({ name: z.string().trim().regex(/^\d{4}-\d{2,4}$/, 'Use a name like 2026-27'), startDate: date, endDate: date, status: z.enum(['planned', 'active', 'closed']).optional() });
settingsRouter.get('/years', ah(async (_req, res) => res.json(await q('SELECT * FROM academic_years ORDER BY start_date DESC'))));
settingsRouter.post('/years', requirePerm('settings.manage'), ah(async (req, res) => {
  const b = yearSchema.parse(req.body);
  if (b.endDate <= b.startDate) throw badRequest('End date must be after start date.');
  const row = await one(
    `INSERT INTO academic_years (name, start_date, end_date, status, is_current)
     VALUES ($1,$2,$3,$4, NOT EXISTS (SELECT 1 FROM academic_years WHERE is_current)) RETURNING *`,
    [b.name, b.startDate, b.endDate, b.status ?? 'planned'],
  );
  await audit(req, 'academic_year.create', 'academic_year', row.id, b);
  res.status(201).json(row);
}));
settingsRouter.put('/years/:id', requirePerm('settings.manage'), ah(async (req, res) => {
  const b = yearSchema.parse(req.body);
  if (b.endDate <= b.startDate) throw badRequest('End date must be after start date.');
  const row = await one('UPDATE academic_years SET name=$2, start_date=$3, end_date=$4, status=coalesce($5,status) WHERE id=$1 RETURNING *',
    [id.parse(req.params.id), b.name, b.startDate, b.endDate, b.status ?? null]);
  if (!row) throw notFound();
  await audit(req, 'academic_year.update', 'academic_year', row.id, b);
  res.json(row);
}));
settingsRouter.post('/years/:id/make-current', requirePerm('settings.manage'), ah(async (req, res) => {
  const yid = id.parse(req.params.id);
  await tx(async (c) => {
    const y = await one('SELECT id FROM academic_years WHERE id=$1', [yid], c);
    if (!y) throw notFound();
    await c.query('UPDATE academic_years SET is_current=false WHERE is_current');
    await c.query(`UPDATE academic_years SET is_current=true, status='active' WHERE id=$1`, [yid]);
    await audit(req, 'academic_year.make_current', 'academic_year', yid, undefined, c);
  });
  res.json({ ok: true });
}));

crud(settingsRouter, { path: '/terms', table: 'terms', perm: 'settings.manage', readPerm: null, allowDelete: true, orderBy: 'academic_year_id, start_date NULLS LAST',
  schema: z.object({ academicYearId: id, name: str(80), startDate: optDate, endDate: optDate }) });
crud(settingsRouter, { path: '/boards', table: 'boards', perm: 'settings.manage', readPerm: null,
  schema: z.object({ code: z.string().trim().regex(/^[A-Z0-9_]{2,12}$/), name: str(120), isActive: bool.optional() }) });
crud(settingsRouter, { path: '/mediums', table: 'mediums', perm: 'settings.manage', readPerm: null,
  schema: z.object({ code: z.string().trim().regex(/^[A-Z0-9_]{2,12}$/), name: str(80), isActive: bool.optional() }) });
crud(settingsRouter, { path: '/classes', table: 'class_levels', perm: 'academics.manage', readPerm: null, orderBy: 'sort_order',
  schema: z.object({ name: str(60), nameHi: optStr(60), code: z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/, 'Short code, letters/digits'), sortOrder: z.coerce.number().int(), isPreschool: bool, isActive: bool.optional() }) });
crud(settingsRouter, { path: '/subjects', table: 'subjects', perm: 'academics.manage', readPerm: null, orderBy: 'name',
  schema: z.object({ name: str(80), nameHi: optStr(80), code: z.string().trim().regex(/^[A-Z0-9_]{2,12}$/, 'Uppercase code, e.g. MATH'), isActive: bool.optional() }) });
crud(settingsRouter, { path: '/domains', table: 'assessment_domains', perm: 'exams.manage', readPerm: null, orderBy: 'sort_order',
  schema: z.object({ name: str(80), nameHi: optStr(80), sortOrder: z.coerce.number().int().default(0), isActive: bool.optional() }) });

// ---------- Grading ----------
settingsRouter.get('/grading', ah(async (_req, res) => {
  const scales = await q('SELECT * FROM grading_scales ORDER BY id');
  const bands = await q('SELECT * FROM grading_bands ORDER BY scale_id, min_percent DESC');
  res.json(scales.map((s) => ({ ...s, bands: bands.filter((b) => b.scale_id === s.id) })));
}));
settingsRouter.put('/grading/:id', requirePerm('exams.manage'), ah(async (req, res) => {
  const b = z.object({
    name: str(80), isDefault: bool,
    bands: z.array(z.object({ minPercent: z.coerce.number().min(0).max(100), grade: str(5), gradePoint: z.coerce.number().min(0).max(10).nullable().optional(), remark: optStr(80) })).min(1),
  }).parse(req.body);
  if (!b.bands.some((x) => x.minPercent === 0)) throw badRequest('One grade band must start at 0%.');
  if (new Set(b.bands.map((x) => x.grade)).size !== b.bands.length) throw badRequest('Grades must be unique.');
  const sid = req.params.id === 'new' ? null : id.parse(req.params.id);
  const out = await tx(async (c) => {
    let scaleId = sid;
    if (scaleId) await c.query('UPDATE grading_scales SET name=$2 WHERE id=$1', [scaleId, b.name]);
    else scaleId = (await one('INSERT INTO grading_scales (name) VALUES ($1) RETURNING id', [b.name], c)).id;
    if (b.isDefault) { await c.query('UPDATE grading_scales SET is_default = (id = $1)', [scaleId]); }
    await c.query('DELETE FROM grading_bands WHERE scale_id=$1', [scaleId]);
    for (const x of b.bands) {
      await c.query('INSERT INTO grading_bands (scale_id, min_percent, grade, grade_point, remark) VALUES ($1,$2,$3,$4,$5)', [scaleId, x.minPercent, x.grade, x.gradePoint ?? null, x.remark]);
    }
    await audit(req, 'grading.save', 'grading_scale', scaleId, b, c);
    return scaleId;
  });
  res.json({ id: out });
}));

// ---------- Public website content ----------
settingsRouter.get('/website/pages', requirePerm('website.manage'), ah(async (_req, res) => res.json(await q('SELECT * FROM public_pages ORDER BY key'))));
settingsRouter.put('/website/pages/:key', requirePerm('website.manage'), ah(async (req, res) => {
  const b = z.object({ title: str(120), titleHi: optStr(120), body: z.string().max(20000), bodyHi: optStr(20000) }).parse(req.body);
  const row = await one('UPDATE public_pages SET title=$2, title_hi=$3, body=$4, body_hi=$5, updated_by=$6, updated_at=now() WHERE key=$1 RETURNING *',
    [req.params.key, b.title, b.titleHi, b.body, b.bodyHi, req.user!.id]);
  if (!row) throw notFound();
  await audit(req, 'website.page_update', 'public_page', req.params.key);
  res.json(row);
}));
crud(settingsRouter, { path: '/website/facilities', table: 'facilities', perm: 'website.manage', allowDelete: true, orderBy: 'sort_order, id',
  schema: z.object({ title: str(120), titleHi: optStr(120), description: optStr(2000), descriptionHi: optStr(2000), icon: z.string().trim().max(30).default('star'), sortOrder: z.coerce.number().int().default(0), isPublished: bool.optional() }) });
crud(settingsRouter, { path: '/website/gallery', table: 'gallery_items', perm: 'website.manage', allowDelete: true, orderBy: 'sort_order, id DESC',
  schema: z.object({ title: str(120), titleHi: optStr(120), fileId: z.string().uuid(), sortOrder: z.coerce.number().int().default(0), isPublished: bool.optional() }) });

// ---------- Users & access ----------
settingsRouter.get('/users', requirePerm('users.manage'), ah(async (req, res) => {
  const role = z.enum(['admin', 'accountant', 'teacher', 'student', 'parent']).optional().parse(req.query.role || undefined);
  const rows = await q(
    `SELECT u.id, u.username, u.role, u.display_name, u.email, u.is_active, u.must_change_password, u.last_login_at, u.locked_until, u.created_at,
            COALESCE((SELECT array_agg(permission ORDER BY permission) FROM user_permissions p WHERE p.user_id = u.id), '{}') AS extra_permissions
       FROM users u WHERE ($1::text IS NULL OR u.role = $1) ORDER BY u.role, u.username LIMIT 2000`, [role ?? null]);
  res.json({ users: rows, grantable: GRANTABLE.map((p) => ({ key: p, label: PERMISSIONS[p] })) });
}));
settingsRouter.post('/users', requirePerm('users.manage'), ah(async (req, res) => {
  const b = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,40}$/), displayName: str(100), role: z.enum(['admin', 'accountant']), email }).parse(req.body);
  const pw = tempPassword();
  const row = await one(`INSERT INTO users (username, password_hash, role, display_name, email) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, role`,
    [b.username, await hashPassword(pw), b.role, b.displayName, b.email]);
  await audit(req, 'user.create', 'user', row.id, { role: b.role });
  res.status(201).json({ ...row, temporaryPassword: pw });
}));
settingsRouter.post('/users/:id/active', requirePerm('users.manage'), ah(async (req, res) => {
  const uid = id.parse(req.params.id);
  const { active } = z.object({ active: bool }).parse(req.body);
  if (uid === req.user!.id && !active) throw badRequest('You cannot deactivate your own account.');
  const r = await one('UPDATE users SET is_active=$2, updated_at=now() WHERE id=$1 RETURNING id', [uid, active]);
  if (!r) throw notFound();
  if (!active) await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(uid)]);
  await audit(req, active ? 'user.activate' : 'user.deactivate', 'user', uid);
  res.json({ ok: true });
}));
settingsRouter.post('/users/:id/reset-password', requirePerm('users.manage'), ah(async (req, res) => {
  const uid = id.parse(req.params.id);
  const pw = tempPassword();
  const r = await one(`UPDATE users SET password_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL, updated_at=now() WHERE id=$1 RETURNING id, username`,
    [uid, await hashPassword(pw)]);
  if (!r) throw notFound();
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(uid)]);
  await pool.query(`UPDATE password_reset_requests SET status='resolved', resolved_by=$2, resolved_at=now() WHERE user_id=$1 AND status='pending'`, [uid, req.user!.id]);
  await audit(req, 'user.password_reset', 'user', uid);
  res.json({ username: r.username, temporaryPassword: pw });
}));
settingsRouter.post('/users/:id/set-password', requirePerm('users.manage'), ah(async (req, res) => {
  const uid = id.parse(req.params.id);
  const { password, mustChange } = z.object({ password: z.string(), mustChange: bool.default(false) }).parse(req.body);
  assertAdminSetPassword(password);
  const r = await one(`UPDATE users SET password_hash=$2, must_change_password=$3, failed_attempts=0, locked_until=NULL, updated_at=now() WHERE id=$1 RETURNING username`,
    [uid, await hashPassword(password), mustChange]);
  if (!r) throw notFound();
  if (uid !== req.user!.id) await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(uid)]);
  await audit(req, 'user.password_set', 'user', uid);
  res.json({ username: r.username, password, mustChange });
}));

settingsRouter.put('/users/:id/permissions', requirePerm('users.manage'), ah(async (req, res) => {
  const uid = id.parse(req.params.id);
  const { permissions } = z.object({ permissions: z.array(z.enum(GRANTABLE as [string, ...string[]])) }).parse(req.body);
  const u = await one('SELECT role FROM users WHERE id=$1', [uid]);
  if (!u) throw notFound();
  if (u.role === 'student' || u.role === 'parent') throw forbidden('Permissions can only be granted to staff accounts.');
  await tx(async (c) => {
    await c.query('DELETE FROM user_permissions WHERE user_id=$1', [uid]);
    for (const p of permissions) await c.query('INSERT INTO user_permissions (user_id, permission, granted_by) VALUES ($1,$2,$3)', [uid, p, req.user!.id]);
    await audit(req, 'user.permissions', 'user', uid, { permissions }, c);
  });
  res.json({ ok: true });
}));
settingsRouter.get('/reset-requests', requirePerm('users.manage'), ah(async (_req, res) => {
  res.json(await q(`SELECT r.*, u.username, u.display_name, u.role FROM password_reset_requests r LEFT JOIN users u ON u.id = r.user_id
                     WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT 200`));
}));
settingsRouter.post('/reset-requests/:id/reject', requirePerm('users.manage'), ah(async (req, res) => {
  await pool.query(`UPDATE password_reset_requests SET status='rejected', resolved_by=$2, resolved_at=now() WHERE id=$1`, [id.parse(req.params.id), req.user!.id]);
  res.json({ ok: true });
}));
// ---------- Sample (demo) data ----------
settingsRouter.get('/demo', requirePerm('settings.manage'), ah(async (_req, res) => {
  const { demoStatus } = await import('../seed/demo.js');
  res.json(await demoStatus());
}));
settingsRouter.post('/demo', requirePerm('settings.manage'), ah(async (req, res) => {
  const { password } = z.object({ password: z.string().min(6, 'Password must be at least 6 characters.').max(128) }).parse(req.body);
  const { seedDemo } = await import('../seed/demo.js');
  try {
    const r = await seedDemo({ password, actorUserId: req.user!.id, log: () => {} });
    await audit(req, 'demo.load', 'demo', null, r.summary);
    res.json(r);
  } catch (e) {
    if ((e as Error).message?.startsWith('Sample data is already loaded')) throw badRequest((e as Error).message);
    throw e;
  }
}));
settingsRouter.delete('/demo', requirePerm('settings.manage'), ah(async (req, res) => {
  const { removeDemo } = await import('../seed/demo.js');
  await removeDemo(() => {});
  await audit(req, 'demo.remove', 'demo', null);
  res.json({ ok: true });
}));

// ---------- Audit & communication logs ----------
settingsRouter.get('/audit', requirePerm('audit.view'), ah(async (req, res) => {
  const f = z.object({ entityType: optStr(60).optional(), entityId: optStr(60).optional(), action: optStr(60).optional(), from: optDate.optional(), to: optDate.optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(200) }).parse(req.query);
  res.json(await q(
    `SELECT a.*, u.username, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ($1::text IS NULL OR a.entity_type = $1) AND ($2::text IS NULL OR a.entity_id = $2) AND ($3::text IS NULL OR a.action ILIKE $3 || '%')
        AND ($4::date IS NULL OR a.at >= $4) AND ($5::date IS NULL OR a.at < $5::date + 1)
      ORDER BY a.at DESC LIMIT $6`,
    [f.entityType ?? null, f.entityId ?? null, f.action ?? null, f.from ?? null, f.to ?? null, f.limit]));
}));
settingsRouter.get('/messages', requirePerm('settings.manage'), ah(async (_req, res) => {
  res.json({
    providers: { email: !!process.env.SMTP_URL, sms: !!process.env.SMS_API_URL, whatsapp: !!process.env.WHATSAPP_API_URL },
    messages: await q('SELECT * FROM message_outbox ORDER BY created_at DESC LIMIT 300'),
  });
}));
