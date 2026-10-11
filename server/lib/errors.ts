import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const forbidden = (m = 'You do not have permission to perform this action.') => new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const conflict = (m: string, d?: unknown) => new HttpError(409, m, d);

/** Wrap async handlers so rejections reach the error middleware. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: err.flatten().fieldErrors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'The file or request is too large.' });
  }
  // Map common Postgres constraint errors to safe messages.
  if (err?.code === '23505') return res.status(409).json({ error: duplicateMessage(err.constraint) });
  if (err?.code === '23503') return res.status(409).json({ error: 'This record is linked to other records and cannot be changed this way.' });
  if (err?.code === '23514' || err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') {
    return res.status(400).json({ error: 'Some values are invalid.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function duplicateMessage(constraint?: string): string {
  const map: Record<string, string> = {
    enrollments_section_id_roll_no_key: 'This roll number is already used in the section.',
    enrollments_student_id_academic_year_id_key: 'The student is already enrolled for this academic year.',
    users_username_key: 'This username is already taken.',
    teaching_assignments_section_id_subject_id_key: 'This subject already has a teacher in the section.',
    timetable_teacher_clash: 'The teacher already has a class in this period.',
    hostel_bed_active_uniq: 'This bed is already occupied.',
    hostel_student_active_uniq: 'The student already has an active hostel allocation.',
    fee_invoices_period_uniq: 'An invoice for this period already exists.',
    students_admission_no_key: 'This admission number already exists.',
  };
  return (constraint && map[constraint]) || 'A record with these details already exists.';
}
