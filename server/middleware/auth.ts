import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { one, q } from '../db/pool.js';
import { forbidden, HttpError } from '../lib/errors.js';
import { ROLE_PERMISSIONS, type Permission, type Role } from '../lib/permissions.js';

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  preferredLanguage: 'en' | 'hi';
  mustChangePassword: boolean;
  teacherId: number | null;
  studentId: number | null;
  permissions: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}
declare module 'express-session' {
  interface SessionData { userId?: number; csrf?: string; authAt?: number }
}

/** Loads the current user from the database on every request so deactivation takes effect immediately. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const uid = req.session?.userId;
    if (uid) {
      const u = await one(
        `SELECT u.id, u.username, u.role, u.display_name, u.preferred_language, u.must_change_password, u.is_active,
                t.id AS teacher_id, s.id AS student_id,
                COALESCE((SELECT array_agg(permission) FROM user_permissions p WHERE p.user_id = u.id), '{}') AS extra
           FROM users u LEFT JOIN teachers t ON t.user_id = u.id LEFT JOIN students s ON s.user_id = u.id
          WHERE u.id = $1`,
        [uid],
      );
      if (!u || !u.is_active || (u.role === 'teacher' && !u.teacher_id) || (u.role === 'student' && !u.student_id)) {
        req.session.userId = undefined;
      } else {
        req.user = {
          id: u.id,
          username: u.username,
          role: u.role,
          displayName: u.display_name,
          preferredLanguage: u.preferred_language,
          mustChangePassword: u.must_change_password,
          teacherId: u.teacher_id,
          studentId: u.student_id,
          permissions: new Set<string>([...ROLE_PERMISSIONS[u.role as Role], ...u.extra]),
        };
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  // Users with a temporary password may only change it.
  if (req.user.mustChangePassword && !req.path.startsWith('/auth/')) {
    return next(new HttpError(403, 'You must change your temporary password before continuing.', { code: 'MUST_CHANGE_PASSWORD' }));
  }
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

export const can = (req: Request, p: Permission) => !!req.user && req.user.permissions.has(p);

export const requirePerm = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (!perms.some((p) => req.user!.permissions.has(p))) return next(forbidden());
  next();
};

/** Double-submit CSRF protection: the session token must accompany every state-changing request. */
export function csrfToken(req: Request): string {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('base64url');
  return req.session.csrf;
}
export function csrfProtect(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token');
  const expected = req.session?.csrf;
  if (!sent || !expected || sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return next(new HttpError(403, 'Your session has expired. Please refresh the page and try again.', { code: 'CSRF' }));
  }
  next();
}

// ---------- Scope helpers: every teacher/student data access goes through these ----------

/** Sections a teacher may access: class-teacher sections plus sections where they teach a subject. */
export async function teacherSectionIds(teacherId: number): Promise<number[]> {
  const rows = await q(
    `SELECT id FROM sections WHERE class_teacher_id = $1
     UNION SELECT section_id FROM teaching_assignments WHERE teacher_id = $1`,
    [teacherId],
  );
  return rows.map((r) => r.id);
}

export async function assertSectionAccess(req: Request, sectionId: number) {
  const u = req.user!;
  if (u.role === 'admin' || u.permissions.has('students.view_all') || u.permissions.has('attendance.view_all')) return;
  if (u.role === 'teacher' && u.teacherId) {
    const ok = await one(
      `SELECT 1 FROM sections WHERE id = $1 AND class_teacher_id = $2
       UNION SELECT 1 FROM teaching_assignments WHERE section_id = $1 AND teacher_id = $2`,
      [sectionId, u.teacherId],
    );
    if (ok) return;
  }
  throw forbidden('You are not assigned to this class/section.');
}

/** Teacher must teach this subject in this section (admins pass). */
export async function assertSubjectAccess(req: Request, sectionId: number, subjectId: number) {
  const u = req.user!;
  if (u.role === 'admin') return;
  if (u.role === 'teacher' && u.teacherId) {
    const ok = await one('SELECT 1 FROM teaching_assignments WHERE section_id=$1 AND subject_id=$2 AND teacher_id=$3', [sectionId, subjectId, u.teacherId]);
    if (ok) return;
  }
  throw forbidden('You are not assigned to teach this subject in this section.');
}

/** Can the current user see this student's record? Students only themselves; teachers only their sections. */
export async function assertStudentAccess(req: Request, studentId: number) {
  const u = req.user!;
  if (u.role === 'admin' || u.permissions.has('students.view_all')) return;
  if (u.role === 'student' && u.studentId === studentId) return;
  if (u.role === 'teacher' && u.teacherId) {
    const ok = await one(
      `SELECT 1 FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current
        WHERE e.student_id = $1 AND (
          e.section_id IN (SELECT id FROM sections WHERE class_teacher_id = $2)
          OR e.section_id IN (SELECT section_id FROM teaching_assignments WHERE teacher_id = $2))`,
      [studentId, u.teacherId],
    );
    if (ok) return;
  }
  throw forbidden('You do not have access to this student.');
}
