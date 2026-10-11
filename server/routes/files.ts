import { Router, type Request } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, pool } from '../db/pool.js';
import { ah, badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { config } from '../config.js';
import { assertSectionAccess, assertStudentAccess, can } from '../middleware/auth.js';

export const filesRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

const PURPOSES = ['logo', 'hero', 'gallery', 'student_photo', 'teacher_photo', 'student_document', 'assignment_attachment', 'material', 'submission', 'notice_attachment'] as const;
const PUBLIC_PURPOSES = new Set(['logo', 'hero', 'gallery']);

/** Detect type from content (magic bytes) rather than trusting the browser-supplied MIME type. */
function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
}

filesRouter.post('/', upload.single('file'), ah(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  const { purpose } = z.object({ purpose: z.enum(PURPOSES) }).parse(req.body);
  if (!req.file) throw badRequest('No file was uploaded.');
  const mime = sniff(req.file.buffer);
  const imageOnly = ['logo', 'hero', 'gallery', 'student_photo', 'teacher_photo'].includes(purpose);
  if (!mime || (imageOnly && !mime.startsWith('image/'))) {
    throw badRequest(imageOnly ? 'Please upload a JPEG, PNG or WebP image.' : 'Allowed files: PDF, Word (.docx), JPEG, PNG, WebP.');
  }
  const u = req.user;
  const staff = u.role === 'admin' || u.role === 'accountant' || u.role === 'teacher';
  if (PUBLIC_PURPOSES.has(purpose) && !can(req, 'website.manage') && !can(req, 'settings.manage')) throw forbidden();
  if (['student_photo', 'student_document'].includes(purpose) && !can(req, 'students.manage')) throw forbidden();
  if (purpose === 'teacher_photo' && !can(req, 'teachers.manage')) throw forbidden();
  if (['assignment_attachment', 'material'].includes(purpose) && !(u.role === 'teacher' || u.role === 'admin')) throw forbidden();
  if (purpose === 'notice_attachment' && !can(req, 'notices.manage') && u.role !== 'teacher') throw forbidden();
  if (purpose === 'submission' && u.role !== 'student') throw forbidden();
  if (!staff && purpose !== 'submission') throw forbidden();

  const id = crypto.randomUUID();
  const safeName = req.file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
  await pool.query(
    'INSERT INTO files (id, original_name, mime_type, size_bytes, visibility, purpose, data, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, safeName, mime, req.file.size, PUBLIC_PURPOSES.has(purpose) ? 'public' : 'private', purpose, req.file.buffer, u.id],
  );
  res.status(201).json({ id, name: safeName, mimeType: mime, size: req.file.size });
}));

async function assertCanRead(req: Request, f: { id: string; visibility: string; purpose: string; uploaded_by: number }) {
  if (f.visibility === 'public') return;
  const u = req.user;
  if (!u) throw new HttpError(401, 'Please sign in.');
  if (u.role === 'admin' || f.uploaded_by === u.id) return;
  switch (f.purpose) {
    case 'student_photo': {
      const s = await one('SELECT id FROM students WHERE photo_file_id = $1', [f.id]);
      if (s) return assertStudentAccess(req, s.id);
      break;
    }
    case 'student_document': {
      if (can(req, 'students.view_all')) return;
      break; // documents are office-only
    }
    case 'teacher_photo':
      if (u.role !== 'student') return;
      break;
    case 'assignment_attachment':
    case 'material': {
      const a = await one(
        `SELECT section_id FROM assignments WHERE attachment_file_id = $1 UNION SELECT section_id FROM study_materials WHERE file_id = $1 LIMIT 1`, [f.id]);
      if (!a) break;
      if (u.role === 'student') {
        const ok = await one(`SELECT 1 FROM enrollments e JOIN academic_years y ON y.id=e.academic_year_id AND y.is_current WHERE e.student_id=$1 AND e.section_id=$2`, [u.studentId, a.section_id]);
        if (ok) return;
        break;
      }
      return assertSectionAccess(req, a.section_id);
    }
    case 'submission': {
      const s = await one(`SELECT a.section_id, s.student_id FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.file_id=$1`, [f.id]);
      if (!s) break;
      if (u.role === 'student') { if (s.student_id === u.studentId) return; break; }
      return assertSectionAccess(req, s.section_id);
    }
    case 'notice_attachment':
      return; // any signed-in user; notice visibility is enforced when listing notices
  }
  throw forbidden('You do not have access to this file.');
}

filesRouter.get('/:id', ah(async (req, res) => {
  const fid = z.string().uuid().safeParse(req.params.id);
  if (!fid.success) throw notFound();
  const f = await one('SELECT id, original_name, mime_type, visibility, purpose, uploaded_by, data FROM files WHERE id = $1', [fid.data]);
  if (!f) throw notFound();
  await assertCanRead(req, f);
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', f.visibility === 'public' ? 'public, max-age=3600' : 'private, no-store');
  const inline = f.mime_type.startsWith('image/') || f.mime_type === 'application/pdf';
  res.setHeader('Content-Disposition', `${inline && req.query.download !== '1' ? 'inline' : 'attachment'}; filename="${f.original_name.replace(/"/g, '')}"`);
  res.send(f.data);
}));
