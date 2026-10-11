import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, pool } from '../db/pool.js';
import { ah, badRequest, HttpError } from '../lib/errors.js';
import { assertStrongPassword, DUMMY_HASH, hashPassword, verifyPassword } from '../lib/passwords.js';
import { audit } from '../lib/audit.js';
import { csrfToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { settings } from '../lib/context.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function publicUser(u: Express.Request['user']) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, role: u.role, displayName: u.displayName,
    preferredLanguage: u.preferredLanguage, mustChangePassword: u.mustChangePassword,
    teacherId: u.teacherId, studentId: u.studentId, permissions: [...u.permissions],
  };
}

authRouter.get('/me', ah(async (req, res) => {
  const s = await settings();
  res.json({
    user: publicUser(req.user),
    csrfToken: csrfToken(req),
    school: { name: s.name, nameHi: s.name_hi, logoFileId: s.logo_file_id, defaultLanguage: s.default_language,
      allowAdmissionNoLogin: s.allow_admission_no_login, allowRollLogin: s.allow_roll_login },
  });
}));

/** Resolve a login identifier to a user id: username/ID, admission number, or CLASS-SECTION-ROLL when enabled. */
async function resolveIdentifier(identifier: string): Promise<number | null> {
  const byUsername = await one('SELECT id FROM users WHERE username = $1', [identifier]);
  if (byUsername) return byUsername.id;
  const s = await settings();
  if (s.allow_admission_no_login) {
    const r = await one('SELECT user_id FROM students WHERE upper(admission_no) = upper($1) AND user_id IS NOT NULL', [identifier]);
    if (r) return r.user_id;
  }
  if (s.allow_roll_login) {
    const m = identifier.match(/^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d{1,4})$/);
    if (m) {
      const r = await one(
        `SELECT st.user_id FROM enrollments e
           JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current
           JOIN sections sec ON sec.id = e.section_id JOIN class_levels cl ON cl.id = e.class_level_id
           JOIN students st ON st.id = e.student_id
          WHERE upper(cl.code) = upper($1) AND upper(sec.name) = upper($2) AND e.roll_no = $3 AND e.status = 'active'`,
        [m[1], m[2], Number(m[3])],
      );
      if (r?.user_id) return r.user_id;
    }
  }
  return null;
}

authRouter.post('/login', loginLimiter, ah(async (req, res) => {
  const body = z.object({ identifier: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).parse(req.body);
  const generic = new HttpError(401, 'Invalid ID or password.');
  const userId = await resolveIdentifier(body.identifier);
  if (!userId) {
    await verifyPassword(body.password, DUMMY_HASH); // equalize timing
    throw generic;
  }
  const u = await one('SELECT id, password_hash, is_active, locked_until, failed_attempts FROM users WHERE id = $1', [userId]);
  if (!u) throw generic;
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    throw new HttpError(429, 'This account is temporarily locked after repeated failed sign-ins. Try again later or contact the school office.');
  }
  const ok = await verifyPassword(body.password, u.password_hash);
  if (!ok || !u.is_active) {
    if (!ok) {
      const failed = u.failed_attempts + 1;
      const lock = failed >= MAX_FAILED;
      await pool.query(
        `UPDATE users SET failed_attempts = $2::int, locked_until = CASE WHEN $3::boolean THEN now() + make_interval(mins => $4::int) ELSE NULL END WHERE id = $1`,
        [u.id, lock ? 0 : failed, lock, LOCK_MINUTES],
      );
      if (failed >= MAX_FAILED) await audit(req, 'auth.locked', 'user', u.id);
    }
    throw ok ? new HttpError(403, 'This account is inactive. Please contact the school office.') : generic;
  }
  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
  // Prevent session fixation.
  await new Promise<void>((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = u.id;
  req.session.authAt = Date.now();
  csrfToken(req);
  await audit(req, 'auth.login', 'user', u.id);
  res.json({ ok: true });
}));

authRouter.post('/logout', ah(async (req, res) => {
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('sms.sid');
  res.json({ ok: true });
}));

authRouter.post('/change-password', ah(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string() }).parse(req.body);
  assertStrongPassword(body.newPassword);
  if (body.newPassword === body.currentPassword) throw badRequest('The new password must be different.');
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(body.currentPassword, u.password_hash))) throw badRequest('Current password is incorrect.');
  await pool.query(
    'UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = now(), updated_at = now() WHERE id = $1',
    [req.user.id, await hashPassword(body.newPassword)],
  );
  // Sign out other sessions of this user.
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1 AND sid <> $2`, [String(req.user.id), req.sessionID]);
  await audit(req, 'auth.password_changed', 'user', req.user.id);
  res.json({ ok: true });
}));

authRouter.post('/language', ah(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  const { language } = z.object({ language: z.enum(['en', 'hi']) }).parse(req.body);
  await pool.query('UPDATE users SET preferred_language = $2 WHERE id = $1', [req.user.id, language]);
  res.json({ ok: true });
}));

/** Self-service reset request: the office verifies the person and issues a temporary password. */
authRouter.post('/forgot', loginLimiter, ah(async (req, res) => {
  const { identifier } = z.object({ identifier: z.string().trim().min(1).max(100) }).parse(req.body);
  const userId = await resolveIdentifier(identifier);
  const recent = await one(`SELECT 1 FROM password_reset_requests WHERE identifier = $1 AND status='pending' AND created_at > now() - interval '1 day'`, [identifier]);
  if (!recent) await pool.query('INSERT INTO password_reset_requests (identifier, user_id) VALUES ($1, $2)', [identifier, userId]);
  res.json({ ok: true, message: 'Your request has been sent to the school office. They will verify your identity and give you a temporary password.' });
}));

// ---------- First-run setup (requires SETUP_TOKEN from the host's environment settings) ----------
export const setupRouter = Router();
setupRouter.get('/status', ah(async (_req, res) => {
  const admin = await one(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  res.json({ needsSetup: !admin, setupEnabled: !!config.setupToken });
}));
setupRouter.post('/', loginLimiter, ah(async (req, res) => {
  const body = z.object({
    token: z.string().min(1), username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,40}$/, 'Use 3–40 letters, digits, dot, dash or underscore'),
    displayName: z.string().trim().min(2).max(100), password: z.string(), schoolName: z.string().trim().min(2).max(200),
  }).parse(req.body);
  if (!config.setupToken) throw new HttpError(403, 'Setup is disabled. Set SETUP_TOKEN in the environment or use "npm run create-admin".');
  const a = Buffer.from(body.token), b = Buffer.from(config.setupToken);
  if (a.length !== b.length || !(await import('node:crypto')).timingSafeEqual(a, b)) throw new HttpError(403, 'Invalid setup token.');
  assertStrongPassword(body.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const exists = await client.query(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`);
    if (exists.rowCount) throw new HttpError(409, 'Setup has already been completed.');
    const r = await client.query(
      `INSERT INTO users (username, password_hash, role, display_name, must_change_password) VALUES ($1,$2,'admin',$3,false) RETURNING id`,
      [body.username, await hashPassword(body.password), body.displayName],
    );
    await client.query('UPDATE school_settings SET name = $1, updated_at = now() WHERE id = 1', [body.schoolName]);
    await client.query('COMMIT');
    await audit(req, 'setup.admin_created', 'user', r.rows[0].id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));
