import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { assertSectionAccess, requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, id, optId, optStr } from '../lib/validate.js';
import { resolveYear } from '../lib/context.js';

export const academicsRouter = Router();

// ---------- Sections ----------
academicsRouter.get('/sections', ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  const u = req.user!;
  const scoped = u.role === 'teacher' && !u.permissions.has('students.view_all') && !u.permissions.has('attendance.view_all');
  if (u.role === 'student') return res.json([]);
  res.json(await q(
    `SELECT s.*, cl.name AS class_name, cl.name_hi AS class_name_hi, cl.code AS class_code, cl.is_preschool, cl.sort_order,
            b.code AS board, m.code AS medium, m.name AS medium_name,
            t.first_name || coalesce(' ' || t.last_name, '') AS class_teacher_name,
            (SELECT count(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') AS student_count
       FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id
       LEFT JOIN boards b ON b.id = s.board_id LEFT JOIN mediums m ON m.id = s.medium_id LEFT JOIN teachers t ON t.id = s.class_teacher_id
      WHERE s.academic_year_id = $1
        AND (NOT $2 OR s.class_teacher_id = $3 OR s.id IN (SELECT section_id FROM teaching_assignments WHERE teacher_id = $3))
      ORDER BY cl.sort_order, s.name`, [y.id, scoped, u.teacherId ?? 0]));
}));

const sectionSchema = z.object({
  academicYearId: id, classLevelId: id, name: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/, 'Use a short name like A'),
  boardId: optId, mediumId: optId, classTeacherId: optId, capacity: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().nullable()),
  room: optStr(40), isActive: bool.optional(),
});
academicsRouter.post('/sections', requirePerm('academics.manage'), ah(async (req, res) => {
  const b = sectionSchema.parse(req.body);
  const row = await one(
    `INSERT INTO sections (academic_year_id, class_level_id, name, board_id, medium_id, class_teacher_id, capacity, room)
     VALUES ($1,$2,upper($3),$4,$5,$6,$7,$8) RETURNING *`,
    [b.academicYearId, b.classLevelId, b.name, b.boardId, b.mediumId, b.classTeacherId, b.capacity, b.room]);
  await audit(req, 'section.create', 'section', row.id, b);
  res.status(201).json(row);
}));
/** Create Section A (with default subjects) for every active class that has no section in the year. */
academicsRouter.post('/sections/defaults', requirePerm('academics.manage'), ah(async (req, res) => {
  const b = z.object({ academicYearId: id, sectionName: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/).default('A') }).parse(req.body);
  const { createDefaultSections } = await import('../services/setup.js');
  const created = await tx(async (c) => {
    const n = await createDefaultSections(c, b.academicYearId, { sectionName: b.sectionName.toUpperCase() });
    await audit(req, 'section.create_defaults', 'academic_year', b.academicYearId, { created: n }, c);
    return n;
  });
  res.json({ created });
}));

academicsRouter.put('/sections/:id', requirePerm('academics.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = sectionSchema.omit({ academicYearId: true, classLevelId: true }).parse(req.body);
  if (b.capacity) {
    const n = await one(`SELECT count(*) AS n FROM enrollments WHERE section_id=$1 AND status='active'`, [sid]);
    if (n.n > b.capacity) throw badRequest(`The section already has ${n.n} students, more than the new capacity.`);
  }
  const row = await one(
    `UPDATE sections SET name=upper($2), board_id=$3, medium_id=$4, class_teacher_id=$5, capacity=$6, room=$7, is_active=coalesce($8,is_active) WHERE id=$1 RETURNING *`,
    [sid, b.name, b.boardId, b.mediumId, b.classTeacherId, b.capacity, b.room, b.isActive ?? null]);
  if (!row) throw notFound();
  await audit(req, 'section.update', 'section', sid, b);
  res.json(row);
}));

academicsRouter.delete('/sections/:id', requirePerm('academics.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  await tx(async (c) => {
    const used = await one('SELECT count(*)::int AS n FROM enrollments WHERE section_id=$1', [sid], c);
    if (used.n > 0) throw badRequest(`${used.n} student(s) are (or were) in this section, so it cannot be deleted. Mark it inactive instead.`);
    await c.query('DELETE FROM timetable_entries WHERE section_id=$1', [sid]);
    await c.query('DELETE FROM teaching_assignments WHERE section_id=$1', [sid]);
    const r = await one('DELETE FROM sections WHERE id=$1 RETURNING name', [sid], c);
    if (!r) throw notFound();
    await audit(req, 'section.delete', 'section', sid, r, c);
  });
  res.json({ ok: true });
}));

/** Re-number roll numbers 1..n in a section, alphabetically (by name) or by admission order. */
academicsRouter.post('/sections/:id/renumber', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const { order } = z.object({ order: z.enum(['alphabetical', 'admission']) }).parse(req.body);
  const n = await tx(async (c) => {
    await c.query('SELECT id FROM sections WHERE id = $1 FOR UPDATE', [sid]);
    const rows = await q(
      `SELECT e.id, e.roll_no FROM enrollments e JOIN students st ON st.id = e.student_id
        WHERE e.section_id = $1 AND e.status = 'active'
        ORDER BY ${order === 'alphabetical' ? "lower(st.first_name), lower(coalesce(st.last_name,'')), st.dob" : 'st.admission_date, st.id'}`, [sid], c);
    const used = await one(`SELECT coalesce(max(roll_no), 0) AS m FROM enrollments WHERE section_id = $1`, [sid], c);
    // Move active rolls out of the way first so the unique (section, roll) rule is never violated mid-update.
    let tmp = used.m + 1000;
    for (const r of rows) await c.query('UPDATE enrollments SET roll_no = $2 WHERE id = $1', [r.id, tmp++]);
    const taken = new Set((await q(`SELECT roll_no FROM enrollments WHERE section_id = $1 AND status <> 'active'`, [sid], c)).map((r) => r.roll_no));
    let next = 1;
    const changes: { enrollmentId: number; from: number; to: number }[] = [];
    for (const r of rows) {
      while (taken.has(next)) next++;
      await c.query('UPDATE enrollments SET roll_no = $2 WHERE id = $1', [r.id, next]);
      if (r.roll_no !== next) changes.push({ enrollmentId: r.id, from: r.roll_no, to: next });
      next++;
    }
    await audit(req, 'section.renumber_rolls', 'section', sid, { order, changes }, c);
    return rows.length;
  });
  res.json({ ok: true, students: n });
}));

/** Section students: admins and teachers assigned to the section. */
academicsRouter.get('/sections/:id/students', ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  await assertSectionAccess(req, sid);
  const includeFinance = req.user!.permissions.has('fees.view');
  res.json(await q(
    `SELECT e.id AS enrollment_id, e.roll_no, e.residency, e.transport_opted, e.status AS enrollment_status,
            st.id AS student_id, st.student_code, st.admission_no, st.first_name, st.last_name, st.gender, st.dob, st.photo_file_id,
            (SELECT g.name FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_name,
            (SELECT g.phone FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_phone,
            ${includeFinance ? `(SELECT coalesce(sum(outstanding_paise),0) FROM fee_line_balances b WHERE b.enrollment_id = e.id)` : 'NULL'} AS outstanding_paise
       FROM enrollments e JOIN students st ON st.id = e.student_id
      WHERE e.section_id = $1 AND e.status IN ('active','promoted','completed','detained')
      ORDER BY e.roll_no`, [sid]));
}));

// ---------- Class subjects ----------
academicsRouter.get('/class-subjects', ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  res.json(await q(
    `SELECT cs.*, s.name AS subject_name, s.code AS subject_code, cl.name AS class_name FROM class_subjects cs
       JOIN subjects s ON s.id = cs.subject_id JOIN class_levels cl ON cl.id = cs.class_level_id
      WHERE cs.academic_year_id = $1 ORDER BY cl.sort_order, s.name`, [y.id]));
}));
academicsRouter.put('/class-subjects', requirePerm('academics.manage'), ah(async (req, res) => {
  const b = z.object({ academicYearId: id, classLevelId: id, subjects: z.array(z.object({ subjectId: id, isOptional: bool.optional() })).max(40) }).parse(req.body);
  await tx(async (c) => {
    const keep = b.subjects.map((s) => s.subjectId);
    // Only remove mappings that are not referenced by teaching assignments.
    const used = await c.query(
      `SELECT DISTINCT ta.subject_id FROM teaching_assignments ta JOIN sections s ON s.id = ta.section_id
        WHERE s.academic_year_id = $1 AND s.class_level_id = $2 AND NOT (ta.subject_id = ANY($3))`, [b.academicYearId, b.classLevelId, keep]);
    if (used.rowCount) throw badRequest('Remove the teacher assignments for a subject before removing it from the class.');
    await c.query('DELETE FROM class_subjects WHERE academic_year_id=$1 AND class_level_id=$2 AND NOT (subject_id = ANY($3))', [b.academicYearId, b.classLevelId, keep]);
    for (const s of b.subjects) {
      await c.query(`INSERT INTO class_subjects (academic_year_id, class_level_id, subject_id, is_optional) VALUES ($1,$2,$3,$4)
                     ON CONFLICT (academic_year_id, class_level_id, subject_id) DO UPDATE SET is_optional = EXCLUDED.is_optional`,
        [b.academicYearId, b.classLevelId, s.subjectId, !!s.isOptional]);
    }
    await audit(req, 'class_subjects.save', 'class_level', b.classLevelId, b, c);
  });
  res.json({ ok: true });
}));

// ---------- Teaching assignments (teacher ↔ subject ↔ section) ----------
academicsRouter.get('/assignments', ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  const u = req.user!;
  const teacherFilter = u.role === 'teacher' ? u.teacherId : (req.query.teacherId ? Number(req.query.teacherId) : null);
  if (u.role === 'student') return res.json([]);
  res.json(await q(
    `SELECT ta.*, sub.name AS subject_name, cl.name AS class_name, cl.id AS class_level_id, cl.is_preschool, s.name AS section_name,
            t.first_name || coalesce(' ' || t.last_name, '') AS teacher_name, t.employee_code
       FROM teaching_assignments ta JOIN sections s ON s.id = ta.section_id JOIN class_levels cl ON cl.id = s.class_level_id
       JOIN subjects sub ON sub.id = ta.subject_id JOIN teachers t ON t.id = ta.teacher_id
      WHERE s.academic_year_id = $1 AND ($2::bigint IS NULL OR ta.teacher_id = $2)
      ORDER BY cl.sort_order, s.name, sub.name`, [y.id, teacherFilter]));
}));
academicsRouter.post('/assignments', requirePerm('academics.manage', 'teachers.manage'), ah(async (req, res) => {
  const b = z.object({ teacherId: id, items: z.array(z.object({ sectionId: id, subjectId: id })).min(1).max(100), replace: bool.optional() }).parse(req.body);
  const out = await tx(async (c) => {
    const t = await one(`SELECT id FROM teachers WHERE id=$1 AND status='active'`, [b.teacherId], c);
    if (!t) throw badRequest('Teacher not found or inactive.');
    const created: number[] = [];
    for (const it of b.items) {
      const ok = await one(
        `SELECT 1 FROM sections s JOIN class_subjects cs ON cs.academic_year_id = s.academic_year_id AND cs.class_level_id = s.class_level_id AND cs.subject_id = $2
          WHERE s.id = $1`, [it.sectionId, it.subjectId], c);
      if (!ok) throw badRequest('Add the subject to the class (Class Subjects) before assigning a teacher.');
      const r = await one(
        `INSERT INTO teaching_assignments (section_id, subject_id, teacher_id) VALUES ($1,$2,$3)
         ON CONFLICT (section_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
         WHERE ${b.replace ? 'true' : 'teaching_assignments.teacher_id = EXCLUDED.teacher_id'} RETURNING id`,
        [it.sectionId, it.subjectId, b.teacherId], c);
      if (!r) throw badRequest('One of the selected subjects already has a different teacher in that section. Tick "replace" to reassign it.');
      created.push(r.id);
    }
    await audit(req, 'teaching_assignment.save', 'teacher', b.teacherId, { items: b.items, replace: !!b.replace }, c);
    return created;
  });
  res.status(201).json({ ids: out });
}));
academicsRouter.delete('/assignments/:id', requirePerm('academics.manage', 'teachers.manage'), ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const r = await one('DELETE FROM teaching_assignments WHERE id=$1 RETURNING *', [aid]);
  if (!r) throw notFound();
  await audit(req, 'teaching_assignment.delete', 'teaching_assignment', aid, r);
  res.json({ ok: true });
}));

// ---------- Timetable ----------
academicsRouter.get('/periods', ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  res.json(await q('SELECT * FROM timetable_periods WHERE academic_year_id=$1 ORDER BY period_no', [y.id]));
}));
academicsRouter.put('/periods', requirePerm('academics.manage'), ah(async (req, res) => {
  const t = z.string().regex(/^\d{2}:\d{2}$/);
  const b = z.object({ academicYearId: id, periods: z.array(z.object({ periodNo: z.coerce.number().int().min(1).max(20), label: optStr(40), startTime: t, endTime: t, isBreak: bool.optional() })).max(20) }).parse(req.body);
  await tx(async (c) => {
    const nos = b.periods.map((p) => p.periodNo);
    const used = await c.query(`SELECT 1 FROM timetable_entries e JOIN timetable_periods p ON p.id = e.period_id WHERE p.academic_year_id=$1 AND NOT (p.period_no = ANY($2)) LIMIT 1`, [b.academicYearId, nos]);
    if (used.rowCount) throw badRequest('A removed period is still used in the timetable. Clear those entries first.');
    await c.query('DELETE FROM timetable_periods WHERE academic_year_id=$1 AND NOT (period_no = ANY($2))', [b.academicYearId, nos]);
    for (const p of b.periods) {
      if (p.endTime <= p.startTime) throw badRequest(`Period ${p.periodNo}: end time must be after start time.`);
      await c.query(`INSERT INTO timetable_periods (academic_year_id, period_no, label, start_time, end_time, is_break) VALUES ($1,$2,$3,$4,$5,$6)
                     ON CONFLICT (academic_year_id, period_no) DO UPDATE SET label=EXCLUDED.label, start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time, is_break=EXCLUDED.is_break`,
        [b.academicYearId, p.periodNo, p.label, p.startTime, p.endTime, !!p.isBreak]);
    }
    await audit(req, 'timetable.periods', 'academic_year', b.academicYearId, undefined, c);
  });
  res.json({ ok: true });
}));

academicsRouter.get('/timetable', ah(async (req, res) => {
  const f = z.object({ sectionId: optId.optional(), teacherId: optId.optional() }).parse(req.query);
  const u = req.user!;
  let sectionId = f.sectionId ?? null;
  let teacherId = f.teacherId ?? null;
  if (u.role === 'student') {
    const e = await one(`SELECT e.section_id FROM enrollments e JOIN academic_years y ON y.id=e.academic_year_id AND y.is_current WHERE e.student_id=$1`, [u.studentId]);
    sectionId = e?.section_id ?? -1; teacherId = null;
  } else if (u.role === 'teacher') {
    if (sectionId) await assertSectionAccess(req, sectionId);
    else teacherId = u.teacherId;
  }
  if (!sectionId && !teacherId) throw badRequest('Choose a section or teacher.');
  res.json(await q(
    `SELECT e.*, p.period_no, p.start_time, p.end_time, p.label AS period_label, sub.name AS subject_name, sub.name_hi AS subject_name_hi,
            t.first_name || coalesce(' ' || t.last_name, '') AS teacher_name, cl.name AS class_name, s.name AS section_name
       FROM timetable_entries e JOIN timetable_periods p ON p.id = e.period_id JOIN academic_years y ON y.id = p.academic_year_id AND y.is_current
       JOIN sections s ON s.id = e.section_id JOIN class_levels cl ON cl.id = s.class_level_id
       LEFT JOIN subjects sub ON sub.id = e.subject_id LEFT JOIN teachers t ON t.id = e.teacher_id
      WHERE ($1::bigint IS NULL OR e.section_id = $1) AND ($2::bigint IS NULL OR e.teacher_id = $2)
      ORDER BY e.day_of_week, p.period_no`, [sectionId, teacherId]));
}));
academicsRouter.put('/timetable/:sectionId', requirePerm('academics.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.sectionId);
  const b = z.object({ entries: z.array(z.object({ dayOfWeek: z.coerce.number().int().min(1).max(7), periodId: id, subjectId: optId, teacherId: optId, room: optStr(40).optional() })).max(200) }).parse(req.body);
  await tx(async (c) => {
    await c.query('DELETE FROM timetable_entries WHERE section_id=$1', [sid]);
    for (const e of b.entries) {
      if (!e.subjectId && !e.teacherId) continue;
      await c.query('INSERT INTO timetable_entries (section_id, period_id, day_of_week, subject_id, teacher_id, room) VALUES ($1,$2,$3,$4,$5,$6)',
        [sid, e.periodId, e.dayOfWeek, e.subjectId, e.teacherId, e.room ?? null]);
    }
    await audit(req, 'timetable.save', 'section', sid, { entries: b.entries.length }, c);
  });
  res.json({ ok: true });
}));
