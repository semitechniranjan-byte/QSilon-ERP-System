import { Router } from 'express';
import { z } from 'zod';
import { one, pool, q, tx, type Db } from '../db/pool.js';
import { ah, badRequest, conflict, notFound } from '../lib/errors.js';
import { assertStudentAccess, can, requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, date, email, id, optDate, optId, optStr, phone, str } from '../lib/validate.js';
import { hashPassword, tempPassword } from '../lib/passwords.js';
import { nextCounter, pad } from '../lib/counters.js';
import { resolveYear, settings } from '../lib/context.js';
import { todayIST } from '../lib/dates.js';
import { assignPlan, studentBalance } from '../services/fees.js';

export const studentsRouter = Router();

const guardianSchema = z.object({
  id: optId.optional(), name: str(120), relation: str(40), phone, altPhone: phone.optional(), email, occupation: optStr(100), address: optStr(500), isPrimary: bool.optional(),
});
const personalSchema = z.object({
  firstName: str(80), lastName: optStr(80), nameHi: optStr(120), dob: date,
  gender: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.enum(['male', 'female', 'other']).nullable()),
  bloodGroup: optStr(5), photoFileId: z.string().uuid().nullable().optional(), address: optStr(500),
  emergencyContactName: optStr(120), emergencyContactPhone: phone, previousSchool: optStr(200), previousClass: optStr(40),
});
const enrollmentSchema = z.object({
  sectionId: id, rollNo: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().nullable()),
  residency: z.enum(['day_scholar', 'hostel']), transportOpted: bool, transportRouteId: optId,
});

async function nextRoll(c: Db, sectionId: number) {
  const r = await one('SELECT coalesce(max(roll_no),0) + 1 AS n FROM enrollments WHERE section_id = $1', [sectionId], c);
  return r.n as number;
}

async function checkSection(c: Db, sectionId: number) {
  const s = await one(
    `SELECT s.*, cl.is_preschool, (SELECT count(*) FROM enrollments e WHERE e.section_id = s.id AND e.status='active') AS used
       FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id WHERE s.id = $1 FOR UPDATE OF s`, [sectionId], c);
  if (!s || !s.is_active) throw badRequest('Section not found or inactive.');
  if (s.capacity && s.used >= s.capacity) throw badRequest('This section is full. Increase its capacity or choose another section.');
  return s;
}

async function saveGuardians(c: Db, studentId: number, guardians: z.infer<typeof guardianSchema>[], isDemo = false) {
  if (!guardians.some((g) => g.isPrimary) && guardians.length) guardians[0].isPrimary = true;
  const keep: number[] = [];
  for (const g of guardians) {
    let gid = g.id ?? null;
    if (gid) {
      const linked = await one('SELECT 1 FROM student_guardians WHERE student_id=$1 AND guardian_id=$2', [studentId, gid], c);
      if (!linked) throw badRequest('Guardian does not belong to this student.');
      await c.query('UPDATE guardians SET name=$2, phone=$3, alt_phone=$4, email=$5, occupation=$6, address=$7 WHERE id=$1',
        [gid, g.name, g.phone, g.altPhone ?? null, g.email, g.occupation, g.address]);
    } else {
      gid = (await one('INSERT INTO guardians (name, phone, alt_phone, email, occupation, address, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [g.name, g.phone, g.altPhone ?? null, g.email, g.occupation, g.address, isDemo], c)).id;
    }
    await c.query(`INSERT INTO student_guardians (student_id, guardian_id, relation, is_primary) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (student_id, guardian_id) DO UPDATE SET relation=EXCLUDED.relation, is_primary=EXCLUDED.is_primary`,
      [studentId, gid, g.relation, !!g.isPrimary]);
    keep.push(gid!);
  }
  await c.query('DELETE FROM student_guardians WHERE student_id=$1 AND NOT (guardian_id = ANY($2))', [studentId, keep]);
}

// ---------- List & search ----------
studentsRouter.get('/', requirePerm('students.view_all', 'students.manage'), ah(async (req, res) => {
  const f = z.object({
    yearId: optId.optional(), sectionId: optId.optional(), classLevelId: optId.optional(), search: optStr(100).optional(),
    status: z.enum(['active', 'withdrawn', 'transferred', 'alumni', 'all']).default('active'), residency: z.enum(['day_scholar', 'hostel']).optional(),
    transport: z.enum(['yes', 'no']).optional(), preschool: z.enum(['yes', 'no']).optional(),
  }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  const y = await resolveYear(f.yearId);
  const fees = can(req, 'fees.view');
  res.json(await q(
    `SELECT st.id, st.student_code, st.admission_no, st.first_name, st.last_name, st.gender, st.dob, st.status, st.photo_file_id, st.admission_date,
            e.id AS enrollment_id, e.roll_no, e.residency, e.transport_opted, e.status AS enrollment_status,
            sec.id AS section_id, sec.name AS section_name, cl.name AS class_name, cl.is_preschool, cl.sort_order,
            (SELECT g.name FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_name,
            (SELECT g.phone FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_phone,
            ${fees ? '(SELECT coalesce(sum(outstanding_paise),0) FROM fee_line_balances b WHERE b.student_id = st.id)' : 'NULL'} AS outstanding_paise
       FROM students st
       LEFT JOIN enrollments e ON e.student_id = st.id AND e.academic_year_id = $1
       LEFT JOIN sections sec ON sec.id = e.section_id LEFT JOIN class_levels cl ON cl.id = e.class_level_id
      WHERE ($2 = 'all' OR st.status = $2)
        AND ($3::bigint IS NULL OR e.section_id = $3) AND ($4::bigint IS NULL OR e.class_level_id = $4)
        AND ($5::text IS NULL OR e.residency = $5)
        AND ($6::text IS NULL OR e.transport_opted = ($6 = 'yes'))
        AND ($7::text IS NULL OR cl.is_preschool = ($7 = 'yes'))
        AND ($8::text IS NULL OR st.first_name || ' ' || coalesce(st.last_name,'') ILIKE '%' || $8 || '%' OR st.student_code ILIKE $8 || '%'
             OR st.admission_no ILIKE '%' || $8 || '%' OR e.roll_no::text = $8)
        AND ($2 <> 'active' OR e.id IS NOT NULL)
      ORDER BY cl.sort_order NULLS LAST, sec.name, e.roll_no, st.first_name LIMIT 2000`,
    [y.id, f.status, f.sectionId ?? null, f.classLevelId ?? null, f.residency ?? null, f.transport ?? null, f.preschool ?? null, f.search ?? null]));
}));

// ---------- Profile corrections (declared before /:id) ----------
studentsRouter.get('/corrections', requirePerm('students.manage'), ah(async (req, res) => {
  const status = z.enum(['pending', 'approved', 'rejected']).default('pending').parse(req.query.status || undefined);
  res.json(await q(`SELECT r.*, st.first_name, st.last_name, st.student_code FROM profile_correction_requests r JOIN students st ON st.id = r.student_id
                     WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 500`, [status]));
}));
const CORRECTABLE: Record<string, string> = { address: 'address', blood_group: 'blood_group', emergency_contact_name: 'emergency_contact_name', emergency_contact_phone: 'emergency_contact_phone', name_hi: 'name_hi' };
studentsRouter.post('/corrections/:id/decide', requirePerm('students.manage'), ah(async (req, res) => {
  const rid = id.parse(req.params.id);
  const b = z.object({ approve: bool, response: optStr(500).optional() }).parse(req.body);
  await tx(async (c) => {
    const r = await one(`SELECT * FROM profile_correction_requests WHERE id=$1 AND status='pending' FOR UPDATE`, [rid], c);
    if (!r) throw notFound('Request not found or already decided.');
    if (b.approve && CORRECTABLE[r.field]) {
      await c.query(`UPDATE students SET ${CORRECTABLE[r.field]} = $2, updated_at = now() WHERE id = $1`, [r.student_id, r.requested_value]);
    }
    await c.query('UPDATE profile_correction_requests SET status=$2, reviewed_by=$3, reviewed_at=now(), response=$4 WHERE id=$1',
      [rid, b.approve ? 'approved' : 'rejected', req.user!.id, b.response ?? null]);
    await audit(req, b.approve ? 'profile_correction.approve' : 'profile_correction.reject', 'student', r.student_id, { field: r.field, value: r.requested_value }, c);
  });
  res.json({ ok: true });
}));

// ---------- Duplicate check ----------
studentsRouter.post('/check-duplicate', requirePerm('students.manage'), ah(async (req, res) => {
  const b = z.object({ firstName: str(80), lastName: optStr(80), dob: date, guardianPhone: phone.optional() }).parse(req.body);
  res.json(await findDuplicates(pool, b.firstName, b.lastName, b.dob, b.guardianPhone ?? null));
}));
async function findDuplicates(c: Db, firstName: string, lastName: string | null, dob: string, guardianPhone: string | null) {
  return q(
    `SELECT st.id, st.student_code, st.admission_no, st.first_name, st.last_name, st.dob, st.status FROM students st
      WHERE (lower(st.first_name) = lower($1) AND lower(coalesce(st.last_name,'')) = lower(coalesce($2,'')) AND st.dob = $3)
         OR ($4::text IS NOT NULL AND st.dob = $3 AND lower(st.first_name) = lower($1) AND EXISTS (
              SELECT 1 FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id AND regexp_replace(g.phone,'\\D','','g') = regexp_replace($4,'\\D','','g')))
      LIMIT 10`, [firstName, lastName, dob, guardianPhone], c);
}

// ---------- Admission ----------
studentsRouter.post('/', requirePerm('students.manage'), ah(async (req, res) => {
  const b = personalSchema.extend({
    admissionDate: optDate, guardians: z.array(guardianSchema).min(1, 'Add at least one parent/guardian').max(4),
    enrollment: enrollmentSchema, feePlanIds: z.array(id).max(3).default([]), confirmDuplicate: bool.optional(), isDemo: bool.optional(),
    documents: z.array(z.object({ fileId: z.string().uuid(), docType: str(60) })).max(10).optional(),
  }).parse(req.body);
  if (b.enrollment.transportOpted && !b.enrollment.transportRouteId) throw badRequest('Choose a transport route.');
  const s = await settings();
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  const out = await tx(async (c) => {
    if (!b.confirmDuplicate) {
      const d = await findDuplicates(c, b.firstName, b.lastName, b.dob, b.guardians[0]?.phone ?? null);
      if (d.length) throw conflict('A student with the same name and date of birth already exists. Review the matches, then confirm to continue.', { code: 'POSSIBLE_DUPLICATE', matches: d });
    }
    const sec = await checkSection(c, b.enrollment.sectionId);
    const y = await one('SELECT id, name, start_date FROM academic_years WHERE id = $1', [sec.academic_year_id], c);
    if (b.enrollment.transportRouteId) {
      const r = await one('SELECT is_active FROM transport_routes WHERE id=$1', [b.enrollment.transportRouteId], c);
      if (!r?.is_active) throw badRequest('Transport route not found or inactive.');
    }
    const yearStart = y.start_date.slice(0, 4);
    const sn = await nextCounter(c, `student_code:${yearStart}`);
    const studentCode = `${s.student_id_prefix}${yearStart}${pad(sn, 4)}`;
    const an = await nextCounter(c, 'admission_no');
    const admissionNo = `${s.admission_prefix}${pad(an, 5)}`;
    const name = [b.firstName, b.lastName].filter(Boolean).join(' ');
    const u = await one(`INSERT INTO users (username, password_hash, role, display_name, is_demo) VALUES ($1,$2,'student',$3,$4) RETURNING id`, [studentCode, hash, name, !!b.isDemo], c);
    const st = await one(
      `INSERT INTO students (user_id, student_code, admission_no, first_name, last_name, name_hi, dob, gender, blood_group, photo_file_id, address,
                             emergency_contact_name, emergency_contact_phone, previous_school, previous_class, admission_date, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [u.id, studentCode, admissionNo, b.firstName, b.lastName, b.nameHi, b.dob, b.gender, b.bloodGroup, b.photoFileId ?? null, b.address,
        b.emergencyContactName, b.emergencyContactPhone, b.previousSchool, b.previousClass, b.admissionDate ?? todayIST(), !!b.isDemo], c);
    await saveGuardians(c, st.id, b.guardians, !!b.isDemo);
    const roll = b.enrollment.rollNo ?? (await nextRoll(c, sec.id));
    const enrolledOn = (b.admissionDate ?? todayIST()) < y.start_date ? y.start_date : (b.admissionDate ?? todayIST());
    const e = await one(
      `INSERT INTO enrollments (student_id, academic_year_id, section_id, class_level_id, roll_no, residency, transport_opted, transport_route_id, enrolled_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [st.id, sec.academic_year_id, sec.id, sec.class_level_id, roll, b.enrollment.residency, b.enrollment.transportOpted,
        b.enrollment.transportOpted ? b.enrollment.transportRouteId : null, enrolledOn], c);
    for (const pid of b.feePlanIds) await assignPlan(c, e.id, pid, req.user!.id);
    for (const d of b.documents ?? []) {
      await c.query('INSERT INTO student_documents (student_id, file_id, doc_type, uploaded_by) VALUES ($1,$2,$3,$4)', [st.id, d.fileId, d.docType, req.user!.id]);
    }
    await audit(req, 'student.admit', 'student', st.id, { studentCode, admissionNo, sectionId: sec.id, rollNo: roll }, c);
    return { student: st, enrollment: e };
  });
  res.status(201).json({ ...out, username: out.student.student_code, temporaryPassword: pw });
}));

// ---------- Profile ----------
studentsRouter.get('/:id', ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  await assertStudentAccess(req, sid);
  const st = await one(`SELECT st.*, u.username, u.is_active AS login_active, u.last_login_at FROM students st LEFT JOIN users u ON u.id = st.user_id WHERE st.id = $1`, [sid]);
  if (!st) throw notFound();
  const staff = req.user!.role !== 'student';
  const [guardians, enrollments, hostel, documents, attendance] = await Promise.all([
    q(`SELECT g.*, sg.relation, sg.is_primary FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = $1 ORDER BY sg.is_primary DESC`, [sid]),
    q(`SELECT e.*, y.name AS year_name, y.is_current, cl.name AS class_name, cl.is_preschool, sec.name AS section_name, b.code AS board, m.code AS medium,
              r.name AS route_name,
              (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'plan_type', p.plan_type)) FROM student_fee_plans sp JOIN fee_plans p ON p.id = sp.fee_plan_id WHERE sp.enrollment_id = e.id) AS fee_plans
         FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id JOIN class_levels cl ON cl.id = e.class_level_id
         JOIN sections sec ON sec.id = e.section_id LEFT JOIN boards b ON b.id = sec.board_id LEFT JOIN mediums m ON m.id = sec.medium_id
         LEFT JOIN transport_routes r ON r.id = e.transport_route_id
        WHERE e.student_id = $1 ORDER BY y.start_date DESC`, [sid]),
    one(`SELECT a.*, h.name AS hostel_name, r.room_no, b.bed_no FROM hostel_allocations a JOIN hostel_beds b ON b.id = a.bed_id
           JOIN hostel_rooms r ON r.id = a.room_id JOIN hostels h ON h.id = r.hostel_id WHERE a.student_id = $1 AND a.check_out IS NULL`, [sid]),
    can(req, 'students.view_all') || can(req, 'students.manage')
      ? q(`SELECT d.id, d.doc_type, d.created_at, f.id AS file_id, f.original_name, f.mime_type FROM student_documents d JOIN files f ON f.id = d.file_id WHERE d.student_id = $1 ORDER BY d.created_at DESC`, [sid])
      : Promise.resolve([]),
    q(`SELECT e.academic_year_id, count(*) AS total, count(*) FILTER (WHERE a.status IN ('present','late')) AS present,
              count(*) FILTER (WHERE a.status = 'half_day') AS half_day, count(*) FILTER (WHERE a.status = 'absent') AS absent, count(*) FILTER (WHERE a.status = 'leave') AS leave
         FROM attendance_records a JOIN enrollments e ON e.id = a.enrollment_id WHERE a.student_id = $1 GROUP BY e.academic_year_id`, [sid]),
  ]);
  const fees = can(req, 'fees.view') || (req.user!.role === 'student' && (await settings()).show_fees_to_students) ? await studentBalance(sid) : null;
  if (!staff) { delete st.username; }
  res.json({ ...st, guardians, enrollments, hostel, documents, attendance, fees });
}));

studentsRouter.put('/:id', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = personalSchema.extend({ admissionDate: optDate, guardians: z.array(guardianSchema).min(1).max(4) }).parse(req.body);
  await tx(async (c) => {
    const st = await one(
      `UPDATE students SET first_name=$2, last_name=$3, name_hi=$4, dob=$5, gender=$6, blood_group=$7, photo_file_id=$8, address=$9,
              emergency_contact_name=$10, emergency_contact_phone=$11, previous_school=$12, previous_class=$13, admission_date=coalesce($14, admission_date), updated_at=now()
        WHERE id=$1 RETURNING user_id`,
      [sid, b.firstName, b.lastName, b.nameHi, b.dob, b.gender, b.bloodGroup, b.photoFileId ?? null, b.address, b.emergencyContactName,
        b.emergencyContactPhone, b.previousSchool, b.previousClass, b.admissionDate], c);
    if (!st) throw notFound();
    await c.query('UPDATE users SET display_name=$2 WHERE id=$1', [st.user_id, [b.firstName, b.lastName].filter(Boolean).join(' ')]);
    await saveGuardians(c, sid, b.guardians);
    await audit(req, 'student.update', 'student', sid, { fields: Object.keys(b) }, c);
  });
  res.json({ ok: true });
}));

/** Change section / roll / residency / transport of an enrollment. */
studentsRouter.put('/:id/enrollments/:enrollmentId', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const eid = id.parse(req.params.enrollmentId);
  const b = enrollmentSchema.extend({ remarks: optStr(300).optional() }).parse(req.body);
  if (b.transportOpted && !b.transportRouteId) throw badRequest('Choose a transport route.');
  await tx(async (c) => {
    const e = await one('SELECT * FROM enrollments WHERE id=$1 AND student_id=$2 FOR UPDATE', [eid, sid], c);
    if (!e) throw notFound();
    let sectionId = e.section_id;
    if (b.sectionId !== e.section_id) {
      const sec = await checkSection(c, b.sectionId);
      if (sec.academic_year_id !== e.academic_year_id) throw badRequest('The new section must be in the same academic year.');
      if (sec.class_level_id !== e.class_level_id) {
        const plans = await one('SELECT 1 FROM student_fee_plans WHERE enrollment_id=$1 LIMIT 1', [eid], c);
        if (plans) await c.query(`DELETE FROM student_fee_plans sp USING fee_plans p WHERE sp.fee_plan_id = p.id AND sp.enrollment_id = $1 AND p.class_level_id IS NOT NULL AND p.class_level_id <> $2`, [eid, sec.class_level_id]);
      }
      sectionId = sec.id;
      await c.query('UPDATE enrollments SET section_id=$2, class_level_id=$3 WHERE id=$1', [eid, sec.id, sec.class_level_id]);
    }
    const roll = b.rollNo ?? (sectionId !== e.section_id ? await nextRoll(c, sectionId) : e.roll_no);
    await c.query('UPDATE enrollments SET roll_no=$2, residency=$3, transport_opted=$4, transport_route_id=$5, remarks=coalesce($6, remarks) WHERE id=$1',
      [eid, roll, b.residency, b.transportOpted, b.transportOpted ? b.transportRouteId : null, b.remarks ?? null]);
    if (b.residency !== 'hostel') await c.query(`DELETE FROM student_fee_plans WHERE enrollment_id=$1 AND plan_type='hostel'`, [eid]);
    await audit(req, 'enrollment.update', 'student', sid, { enrollmentId: eid, before: { section: e.section_id, roll: e.roll_no, residency: e.residency, transport: e.transport_opted }, after: { ...b, rollNo: roll } }, c);
  });
  res.json({ ok: true });
}));

studentsRouter.put('/:id/enrollments/:enrollmentId/fee-plans', requirePerm('fees.manage', 'students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const eid = id.parse(req.params.enrollmentId);
  const { planIds } = z.object({ planIds: z.array(id).max(3) }).parse(req.body);
  await tx(async (c) => {
    const e = await one('SELECT id FROM enrollments WHERE id=$1 AND student_id=$2', [eid, sid], c);
    if (!e) throw notFound();
    await c.query('DELETE FROM student_fee_plans WHERE enrollment_id=$1', [eid]);
    for (const p of planIds) await assignPlan(c, eid, p, req.user!.id);
    await audit(req, 'enrollment.fee_plans', 'student', sid, { enrollmentId: eid, planIds }, c);
  });
  res.json({ ok: true });
}));

// ---------- Promotion / withdrawal / re-admission ----------
studentsRouter.post('/promote', requirePerm('students.manage'), ah(async (req, res) => {
  const b = z.object({
    toYearId: id,
    items: z.array(z.object({ enrollmentId: id, action: z.enum(['promote', 'detain', 'complete']), toSectionId: optId })).min(1).max(600),
  }).parse(req.body);
  const result = await tx(async (c) => {
    const toYear = await one('SELECT id FROM academic_years WHERE id=$1', [b.toYearId], c);
    if (!toYear) throw badRequest('Target academic year not found.');
    let promoted = 0, completed = 0;
    for (const it of b.items) {
      const e = await one(`SELECT * FROM enrollments WHERE id=$1 FOR UPDATE`, [it.enrollmentId], c);
      if (!e || e.status !== 'active') throw badRequest(`Enrollment ${it.enrollmentId} is not active.`);
      if (e.academic_year_id === b.toYearId) throw badRequest('Choose a different academic year to promote into.');
      if (it.action === 'complete') {
        await c.query(`UPDATE enrollments SET status='completed', left_on=CURRENT_DATE WHERE id=$1`, [e.id]);
        await c.query(`UPDATE students SET status='alumni', status_changed_at=now(), status_reason='Completed schooling' WHERE id=$1`, [e.student_id]);
        completed++;
        continue;
      }
      if (!it.toSectionId) throw badRequest('Choose the target section for each student.');
      const sec = await checkSection(c, it.toSectionId);
      if (sec.academic_year_id !== b.toYearId) throw badRequest('Target section must belong to the target academic year.');
      // History is preserved: the old enrollment (with its attendance, marks and fees) stays, marked promoted/detained.
      await c.query('UPDATE enrollments SET status=$2, left_on=CURRENT_DATE WHERE id=$1', [e.id, it.action === 'promote' ? 'promoted' : 'detained']);
      const y = await one('SELECT start_date FROM academic_years WHERE id=$1', [b.toYearId], c);
      await c.query(
        `INSERT INTO enrollments (student_id, academic_year_id, section_id, class_level_id, roll_no, residency, transport_opted, transport_route_id, enrolled_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.student_id, b.toYearId, sec.id, sec.class_level_id, await nextRoll(c, sec.id), e.residency, e.transport_opted, e.transport_route_id, y.start_date]);
      promoted++;
    }
    await audit(req, 'student.promote', 'academic_year', b.toYearId, { promoted, completed, count: b.items.length }, c);
    return { promoted, completed };
  });
  res.json(result);
}));

studentsRouter.post('/:id/withdraw', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = z.object({ status: z.enum(['withdrawn', 'transferred']), date, reason: str(500) }).parse(req.body);
  await tx(async (c) => {
    const st = await one('SELECT id, user_id, status FROM students WHERE id=$1 FOR UPDATE', [sid], c);
    if (!st) throw notFound();
    if (st.status !== 'active') throw badRequest('Student is not active.');
    await c.query('UPDATE students SET status=$2, status_changed_at=now(), status_reason=$3 WHERE id=$1', [sid, b.status, b.reason]);
    await c.query(`UPDATE enrollments SET status=$2, left_on=$3 WHERE student_id=$1 AND status='active'`, [sid, b.status, b.date]);
    await c.query('UPDATE hostel_allocations SET check_out=$2 WHERE student_id=$1 AND check_out IS NULL', [sid, b.date]);
    await c.query('UPDATE users SET is_active=false WHERE id=$1', [st.user_id]);
    await c.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(st.user_id)]);
    await audit(req, `student.${b.status}`, 'student', sid, b, c);
  });
  res.json({ ok: true });
}));

studentsRouter.post('/:id/readmit', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = enrollmentSchema.extend({ feePlanIds: z.array(id).max(3).default([]) }).parse(req.body);
  await tx(async (c) => {
    const st = await one('SELECT id, user_id, status FROM students WHERE id=$1 FOR UPDATE', [sid], c);
    if (!st) throw notFound();
    if (st.status === 'active') throw badRequest('Student is already active.');
    const sec = await checkSection(c, b.sectionId);
    const roll = b.rollNo ?? (await nextRoll(c, sec.id));
    const existing = await one('SELECT id FROM enrollments WHERE student_id=$1 AND academic_year_id=$2', [sid, sec.academic_year_id], c);
    let eid: number;
    if (existing) {
      await c.query(`UPDATE enrollments SET section_id=$2, class_level_id=$3, roll_no=$4, residency=$5, transport_opted=$6, transport_route_id=$7, status='active', left_on=NULL WHERE id=$1`,
        [existing.id, sec.id, sec.class_level_id, roll, b.residency, b.transportOpted, b.transportOpted ? b.transportRouteId : null]);
      eid = existing.id;
    } else {
      eid = (await one(`INSERT INTO enrollments (student_id, academic_year_id, section_id, class_level_id, roll_no, residency, transport_opted, transport_route_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [sid, sec.academic_year_id, sec.id, sec.class_level_id, roll, b.residency, b.transportOpted, b.transportOpted ? b.transportRouteId : null], c)).id;
    }
    for (const p of b.feePlanIds) await assignPlan(c, eid, p, req.user!.id);
    await c.query(`UPDATE students SET status='active', status_changed_at=now(), status_reason='Re-admitted' WHERE id=$1`, [sid]);
    await c.query('UPDATE users SET is_active=true WHERE id=$1', [st.user_id]);
    await audit(req, 'student.readmit', 'student', sid, { sectionId: sec.id }, c);
  });
  res.json({ ok: true });
}));

studentsRouter.post('/:id/reset-password', requirePerm('students.manage', 'users.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const st = await one('SELECT user_id FROM students WHERE id=$1', [sid]);
  if (!st?.user_id) throw notFound();
  const pw = tempPassword();
  const u = await one('UPDATE users SET password_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL WHERE id=$1 RETURNING username', [st.user_id, await hashPassword(pw)]);
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [String(st.user_id)]);
  await audit(req, 'student.password_reset', 'student', sid);
  res.json({ username: u.username, temporaryPassword: pw });
}));

studentsRouter.post('/:id/documents', requirePerm('students.manage'), ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  const b = z.object({ fileId: z.string().uuid(), docType: str(60) }).parse(req.body);
  const f = await one(`SELECT purpose FROM files WHERE id=$1`, [b.fileId]);
  if (!f || f.purpose !== 'student_document') throw badRequest('Upload the document first.');
  const r = await one('INSERT INTO student_documents (student_id, file_id, doc_type, uploaded_by) VALUES ($1,$2,$3,$4) RETURNING id', [sid, b.fileId, b.docType, req.user!.id]);
  await audit(req, 'student.document_add', 'student', sid, b);
  res.status(201).json(r);
}));

studentsRouter.get('/next-roll/:sectionId', requirePerm('students.manage'), ah(async (req, res) => {
  res.json({ rollNo: await nextRoll(pool, id.parse(req.params.sectionId)) });
}));

