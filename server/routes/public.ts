import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { ah, forbidden } from '../lib/errors.js';
import { settings } from '../lib/context.js';
import { date, optStr, bool } from '../lib/validate.js';
import { config } from '../config.js';

export const publicRouter = Router();

/** Everything the public website needs. Only aggregate counts and explicitly public content — never personal records. */
publicRouter.get('/site', ah(async (_req, res) => {
  const s = await settings();
  let stats: Record<string, number | null> | null = null;
  if (s.public_stats_mode === 'manual') {
    stats = { students: s.public_students_count, teachers: s.public_teachers_count, classes: s.public_classes_count, yearsExperience: s.public_years_experience };
  } else if (s.public_stats_mode === 'auto') {
    const r = await one(`
      SELECT (SELECT count(*) FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current WHERE e.status = 'active') AS students,
             (SELECT count(*) FROM teachers WHERE status = 'active') AS teachers,
             (SELECT count(DISTINCT sec.class_level_id) FROM sections sec JOIN academic_years y ON y.id = sec.academic_year_id AND y.is_current WHERE sec.is_active) AS classes`);
    stats = {
      students: r.students, teachers: r.teachers, classes: r.classes,
      yearsExperience: s.established_year ? new Date().getFullYear() - s.established_year : s.public_years_experience,
    };
  }
  const [pages, facilities, gallery, notices, events, classes, boards, mediums, routes, hostels] = await Promise.all([
    q('SELECT key, title, title_hi, body, body_hi FROM public_pages'),
    q('SELECT id, title, title_hi, description, description_hi, icon FROM facilities WHERE is_published ORDER BY sort_order, id'),
    q('SELECT id, title, title_hi, file_id FROM gallery_items WHERE is_published ORDER BY sort_order, id DESC LIMIT 60'),
    q(`SELECT id, title, title_hi, body, body_hi, publish_at, pinned, attachment_file_id FROM notices
        WHERE audience = 'public' AND publish_at <= now() AND (expires_at IS NULL OR expires_at > now())
        ORDER BY pinned DESC, publish_at DESC LIMIT 20`),
    q(`SELECT id, title, title_hi, description, event_type, start_date, end_date, location FROM events
        WHERE is_public AND coalesce(end_date, start_date) >= CURRENT_DATE - 30 ORDER BY start_date LIMIT 20`),
    q('SELECT id, name, name_hi, is_preschool FROM class_levels WHERE is_active ORDER BY sort_order'),
    q('SELECT code, name FROM boards WHERE is_active ORDER BY id'),
    q('SELECT code, name FROM mediums WHERE is_active ORDER BY id'),
    q('SELECT name, description, stops FROM transport_routes WHERE is_active ORDER BY name'),
    q(`SELECT name, hostel_type FROM hostels WHERE is_active ORDER BY name`),
  ]);
  res.json({
    school: {
      name: s.name, nameHi: s.name_hi, tagline: s.tagline, taglineHi: s.tagline_hi, logoFileId: s.logo_file_id, heroImageFileId: s.hero_image_file_id,
      address: s.address, city: s.city, state: s.state, pincode: s.pincode, phone: s.phone, email: s.email, website: s.website, mapUrl: s.map_url,
      establishedYear: s.established_year, principalName: s.principal_name, about: s.about, aboutHi: s.about_hi, mission: s.mission, missionHi: s.mission_hi,
      enquiryEnabled: s.enquiry_enabled, schoolHours: s.school_hours, schoolHoursHi: s.school_hours_hi,
    },
    stats, pages, facilities, gallery, notices, events, classes, boards, mediums, routes, hostels,
  });
}));

const enquiryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.isTest ? 1000 : 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many enquiries from this connection. Please try again later or call the school.' } });

publicRouter.post('/enquiry', enquiryLimiter, ah(async (req, res) => {
  const s = await settings();
  if (!s.enquiry_enabled) throw forbidden('Online enquiries are currently closed. Please contact the school office.');
  const b = z.object({
    studentName: z.string().trim().min(2).max(120),
    dob: z.preprocess((v) => (v === '' || v === undefined ? null : v), date.nullable().optional()),
    classSought: z.string().trim().min(1).max(60),
    parentName: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number'),
    email: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().email().max(200).nullable().optional()),
    message: optStr(2000).optional(),
    needsHostel: bool.optional(),
    needsTransport: bool.optional(),
    website: z.string().max(0).optional(), // honeypot: must stay empty
  }).parse(req.body);
  await pool.query(
    `INSERT INTO admission_enquiries (student_name, dob, class_sought, parent_name, phone, email, message, needs_hostel, needs_transport)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [b.studentName, b.dob ?? null, b.classSought, b.parentName, b.phone, b.email ?? null, b.message ?? null, !!b.needsHostel, !!b.needsTransport],
  );
  res.status(201).json({ ok: true });
}));
