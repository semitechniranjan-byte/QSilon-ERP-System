import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { bool, date, id, optStr, str } from '../lib/validate.js';
import { todayIST } from '../lib/dates.js';

export const hostelRouter = Router();
hostelRouter.use(requirePerm('hostel.manage'));

const hostelSchema = z.object({ name: str(100), hostelType: z.enum(['boys', 'girls', 'co_ed']), building: optStr(100), wardenName: optStr(100),
  wardenPhone: optStr(30), emergencyPhone: optStr(30), notes: optStr(1000), isActive: bool.optional() });

hostelRouter.get('/', ah(async (_req, res) => {
  res.json(await q(
    `SELECT h.*, (SELECT count(*) FROM hostel_rooms r WHERE r.hostel_id = h.id AND r.is_active) AS rooms,
            (SELECT coalesce(sum(r.capacity),0) FROM hostel_rooms r WHERE r.hostel_id = h.id AND r.is_active) AS capacity,
            (SELECT count(*) FROM hostel_allocations a JOIN hostel_rooms r ON r.id = a.room_id WHERE r.hostel_id = h.id AND a.check_out IS NULL) AS occupied
       FROM hostels h ORDER BY h.name`));
}));
hostelRouter.post('/', ah(async (req, res) => {
  const b = hostelSchema.parse(req.body);
  const h = await one(`INSERT INTO hostels (name, hostel_type, building, warden_name, warden_phone, emergency_phone, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.name, b.hostelType, b.building, b.wardenName, b.wardenPhone, b.emergencyPhone, b.notes]);
  await audit(req, 'hostel.create', 'hostel', h.id, b);
  res.status(201).json(h);
}));
hostelRouter.put('/:id', ah(async (req, res) => {
  const b = hostelSchema.parse(req.body);
  const h = await one(`UPDATE hostels SET name=$2, hostel_type=$3, building=$4, warden_name=$5, warden_phone=$6, emergency_phone=$7, notes=$8, is_active=coalesce($9,is_active) WHERE id=$1 RETURNING *`,
    [id.parse(req.params.id), b.name, b.hostelType, b.building, b.wardenName, b.wardenPhone, b.emergencyPhone, b.notes, b.isActive ?? null]);
  if (!h) throw notFound();
  await audit(req, 'hostel.update', 'hostel', h.id, b);
  res.json(h);
}));

hostelRouter.get('/:id/rooms', ah(async (req, res) => {
  const hid = id.parse(req.params.id);
  const rooms = await q(`SELECT r.* FROM hostel_rooms r WHERE r.hostel_id = $1 ORDER BY r.floor NULLS FIRST, r.room_no`, [hid]);
  const beds = await q(
    `SELECT b.id, b.room_id, b.bed_no, b.is_active, a.id AS allocation_id, a.check_in, st.id AS student_id, st.first_name, st.last_name, st.student_code
       FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id
       LEFT JOIN hostel_allocations a ON a.bed_id = b.id AND a.check_out IS NULL LEFT JOIN students st ON st.id = a.student_id
      WHERE r.hostel_id = $1 ORDER BY b.bed_no`, [hid]);
  res.json(rooms.map((r) => ({ ...r, beds: beds.filter((b) => b.room_id === r.id) })));
}));

const roomSchema = z.object({ roomNo: str(20), floor: optStr(20), roomType: optStr(40), capacity: z.coerce.number().int().min(1).max(50), isActive: bool.optional() });
hostelRouter.post('/:id/rooms', ah(async (req, res) => {
  const hid = id.parse(req.params.id);
  const b = roomSchema.parse(req.body);
  const r = await tx(async (c) => {
    const room = await one('INSERT INTO hostel_rooms (hostel_id, room_no, floor, room_type, capacity) VALUES ($1,$2,$3,$4,$5) RETURNING *', [hid, b.roomNo, b.floor, b.roomType, b.capacity], c);
    for (let i = 1; i <= b.capacity; i++) await c.query('INSERT INTO hostel_beds (room_id, bed_no) VALUES ($1,$2)', [room.id, `B${i}`]);
    await audit(req, 'hostel_room.create', 'hostel_room', room.id, b, c);
    return room;
  });
  res.status(201).json(r);
}));
hostelRouter.put('/rooms/:roomId', ah(async (req, res) => {
  const rid = id.parse(req.params.roomId);
  const b = roomSchema.parse(req.body);
  await tx(async (c) => {
    const room = await one('SELECT * FROM hostel_rooms WHERE id=$1 FOR UPDATE', [rid], c);
    if (!room) throw notFound();
    const occ = (await one('SELECT count(*) AS n FROM hostel_allocations WHERE room_id=$1 AND check_out IS NULL', [rid], c)).n;
    if (b.capacity < occ) throw badRequest(`${occ} students currently occupy this room; capacity cannot be lower.`);
    await c.query('UPDATE hostel_rooms SET room_no=$2, floor=$3, room_type=$4, capacity=$5, is_active=coalesce($6,is_active) WHERE id=$1', [rid, b.roomNo, b.floor, b.roomType, b.capacity, b.isActive ?? null]);
    // Keep exactly `capacity` active beds: re-activate/create, or deactivate free beds.
    const beds = await q(`SELECT b.id, b.bed_no, b.is_active, EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.check_out IS NULL) AS occupied
                            FROM hostel_beds b WHERE b.room_id=$1 ORDER BY b.id`, [rid], c);
    let active = beds.filter((x) => x.is_active).length;
    for (const bed of beds) { if (active >= b.capacity) break; if (!bed.is_active) { await c.query('UPDATE hostel_beds SET is_active=true WHERE id=$1', [bed.id]); active++; } }
    let n = beds.length;
    while (active < b.capacity) { n++; await c.query('INSERT INTO hostel_beds (room_id, bed_no) VALUES ($1,$2)', [rid, `B${n}`]); active++; }
    for (const bed of [...beds].reverse()) { if (active <= b.capacity) break; if (bed.is_active && !bed.occupied) { await c.query('UPDATE hostel_beds SET is_active=false WHERE id=$1', [bed.id]); active--; } }
    await audit(req, 'hostel_room.update', 'hostel_room', rid, b, c);
  });
  res.json({ ok: true });
}));

async function allocate(c: any, studentId: number, bedId: number, checkIn: string, userId: number, notes?: string | null) {
  const bed = await one(`SELECT b.*, r.capacity, r.is_active AS room_active, r.id AS room_id FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id WHERE b.id=$1`, [bedId], c);
  if (!bed || !bed.is_active || !bed.room_active) throw badRequest('Bed not found or inactive.');
  // Lock the room so concurrent allocations cannot exceed its capacity.
  await c.query('SELECT id FROM hostel_rooms WHERE id=$1 FOR UPDATE', [bed.room_id]);
  const occ = (await one('SELECT count(*) AS n FROM hostel_allocations WHERE room_id=$1 AND check_out IS NULL', [bed.room_id], c)).n;
  if (occ >= bed.capacity) throw badRequest('This room is already at full capacity.');
  const taken = await one('SELECT 1 FROM hostel_allocations WHERE bed_id=$1 AND check_out IS NULL', [bedId], c);
  if (taken) throw badRequest('This bed is already occupied.');
  return one(`INSERT INTO hostel_allocations (student_id, bed_id, room_id, check_in, allocated_by, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [studentId, bedId, bed.room_id, checkIn, userId, notes ?? null], c);
}

hostelRouter.post('/allocations', ah(async (req, res) => {
  const b = z.object({ studentId: id, bedId: id, checkIn: date.default(() => todayIST()), notes: optStr(300).optional() }).parse(req.body);
  const out = await tx(async (c) => {
    const e = await one(`SELECT e.id, e.residency, st.status FROM enrollments e JOIN academic_years y ON y.id=e.academic_year_id AND y.is_current
                          JOIN students st ON st.id = e.student_id WHERE e.student_id=$1 AND e.status='active'`, [b.studentId], c);
    if (!e || e.status !== 'active') throw badRequest('Student is not actively enrolled in the current year.');
    if (e.residency !== 'hostel') throw badRequest('Mark the student as a hostel resident (Admissions > Enrollment) before allocating a bed.');
    const existing = await one('SELECT id FROM hostel_allocations WHERE student_id=$1 AND check_out IS NULL', [b.studentId], c);
    if (existing) throw badRequest('Student already has a bed. Use Transfer instead.');
    const a = await allocate(c, b.studentId, b.bedId, b.checkIn, req.user!.id, b.notes);
    await audit(req, 'hostel.allocate', 'student', b.studentId, { bedId: b.bedId }, c);
    return a;
  });
  res.status(201).json(out);
}));
hostelRouter.post('/allocations/:id/checkout', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const b = z.object({ date: date.default(() => todayIST()), notes: optStr(300).optional() }).parse(req.body);
  const a = await one('UPDATE hostel_allocations SET check_out=$2, notes=coalesce($3, notes) WHERE id=$1 AND check_out IS NULL AND check_in <= $2 RETURNING student_id', [aid, b.date, b.notes ?? null]);
  if (!a) throw badRequest('Allocation not found, already checked out, or date is before check-in.');
  await audit(req, 'hostel.checkout', 'student', a.student_id, { allocationId: aid, date: b.date });
  res.json({ ok: true });
}));
hostelRouter.post('/allocations/:id/transfer', ah(async (req, res) => {
  const aid = id.parse(req.params.id);
  const b = z.object({ bedId: id, date: date.default(() => todayIST()) }).parse(req.body);
  const out = await tx(async (c) => {
    const a = await one('SELECT * FROM hostel_allocations WHERE id=$1 AND check_out IS NULL FOR UPDATE', [aid], c);
    if (!a) throw notFound('Active allocation not found.');
    if (a.bed_id === b.bedId) throw badRequest('Choose a different bed.');
    await c.query('UPDATE hostel_allocations SET check_out=$2 WHERE id=$1', [aid, b.date < a.check_in ? a.check_in : b.date]);
    const n = await allocate(c, a.student_id, b.bedId, b.date, req.user!.id, `Transferred from allocation ${aid}`);
    await audit(req, 'hostel.transfer', 'student', a.student_id, { from: a.bed_id, to: b.bedId }, c);
    return n;
  });
  res.json(out);
}));

hostelRouter.get('/reports/occupancy', ah(async (_req, res) => {
  res.json(await q(
    `SELECT h.name AS hostel, r.id AS room_id, r.room_no, r.floor, r.capacity,
            (SELECT count(*) FROM hostel_allocations a WHERE a.room_id = r.id AND a.check_out IS NULL) AS occupied
       FROM hostel_rooms r JOIN hostels h ON h.id = r.hostel_id WHERE r.is_active AND h.is_active ORDER BY h.name, r.floor NULLS FIRST, r.room_no`));
}));
hostelRouter.get('/reports/vacant', ah(async (_req, res) => {
  res.json(await q(
    `SELECT h.name AS hostel, h.hostel_type, r.room_no, r.floor, b.id AS bed_id, b.bed_no FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
      WHERE b.is_active AND r.is_active AND h.is_active AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.check_out IS NULL)
      ORDER BY h.name, r.room_no, b.bed_no`));
}));
hostelRouter.get('/residents', ah(async (_req, res) => {
  res.json(await q(
    `SELECT st.id AS student_id, st.first_name, st.last_name, st.student_code, st.gender, cl.name AS class_name, sec.name AS section_name, e.roll_no,
            st.emergency_contact_name, st.emergency_contact_phone,
            (SELECT g.name || ' (' || coalesce(g.phone,'-') || ')' FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian,
            a.id AS allocation_id, a.check_in, h.name AS hostel_name, r.room_no, b.bed_no
       FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current JOIN students st ON st.id = e.student_id
       JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
       LEFT JOIN hostel_allocations a ON a.student_id = st.id AND a.check_out IS NULL
       LEFT JOIN hostel_beds b ON b.id = a.bed_id LEFT JOIN hostel_rooms r ON r.id = a.room_id LEFT JOIN hostels h ON h.id = r.hostel_id
      WHERE e.residency = 'hostel' AND e.status = 'active' ORDER BY h.name NULLS FIRST, r.room_no, st.first_name`));
}));
hostelRouter.get('/history/:studentId', ah(async (req, res) => {
  res.json(await q(`SELECT a.*, h.name AS hostel_name, r.room_no, b.bed_no FROM hostel_allocations a JOIN hostel_beds b ON b.id=a.bed_id JOIN hostel_rooms r ON r.id=a.room_id
                    JOIN hostels h ON h.id=r.hostel_id WHERE a.student_id=$1 ORDER BY a.check_in DESC`, [id.parse(req.params.studentId)]));
}));
