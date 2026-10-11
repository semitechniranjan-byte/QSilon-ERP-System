import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { Client, freshApp, ok } from './helpers.js';

let app: Express;
let pool: any;
beforeAll(async () => {
  app = await freshApp();
  pool = (await import('../server/db/pool.js')).pool;
  const { hashPassword } = await import('../server/lib/passwords.js');
  await pool.query(`INSERT INTO users (username, password_hash, role, display_name, must_change_password) VALUES ('principal', $1, 'admin', 'Principal', false)`, [await hashPassword('Principal123')]);
});
afterAll(async () => { await pool?.end(); });

describe('money helpers', () => {
  it('parses rupees without floating point error and formats paise', async () => {
    const { rupeesToPaise, formatPaise, percentOf } = await import('../server/lib/money.js');
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('1200.50')).toBe(120050);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(() => rupeesToPaise('1.234')).toThrow();
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(percentOf(150000, 3333)).toBe(49995);
  });
});

describe('account protection', () => {
  it('locks an account after repeated failed sign-ins', async () => {
    const c = await new Client(app).init();
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/login', { identifier: 'principal', password: 'wrong-pass1' })).status).toBe(401);
    expect((await c.post('/api/auth/login', { identifier: 'principal', password: 'Principal123' })).status).toBe(429);
    await pool.query(`UPDATE users SET locked_until = NULL WHERE username = 'principal'`);
    expect((await c.post('/api/auth/login', { identifier: 'principal', password: 'Principal123' })).status).toBe(200);
  });
  it('rejects weak passwords and requires a temporary password to be changed', async () => {
    const admin = await new Client(app).login('principal', 'Principal123');
    const r = ok(await admin.post('/api/settings/users', { username: 'office1', displayName: 'Office', role: 'accountant' }), 201);
    const c = await new Client(app).login('office1', r.temporaryPassword);
    expect((await c.get('/api/fees/receipts')).status).toBe(403); // must change password first
    expect((await c.post('/api/auth/change-password', { currentPassword: r.temporaryPassword, newPassword: 'short' })).status).toBe(400);
    ok(await c.post('/api/auth/change-password', { currentPassword: r.temporaryPassword, newPassword: 'Accounts2026' }));
    const c2 = await new Client(app).login('office1', 'Accounts2026');
    expect((await c2.get('/api/fees/receipts')).status).toBe(200);
    expect((await c2.get('/api/settings/users')).status).toBe(403); // accountant is not an administrator
  });
});

describe('first-start academic setup', () => {
  it('creates the current year with Section A for Nursery to Class 12', async () => {
    const { bootstrapAcademics } = await import('../server/services/setup.js');
    await bootstrapAcademics(() => {});
    await bootstrapAcademics(() => {}); // idempotent
    const admin = await new Client(app).login('principal', 'Principal123');
    const lk = ok(await admin.get('/api/settings/lookups'));
    expect(lk.years).toHaveLength(1);
    const names = lk.sections.map((s: any) => s.class_name);
    expect(names[0]).toBe('Nursery');
    expect(names).toContain('Class 12');
    expect(names).not.toContain('LKG');
    expect(lk.sections).toHaveLength(13);
    const cs = ok(await admin.get('/api/academics/class-subjects'));
    expect(cs.length).toBeGreaterThan(40);
    // The button creates sections only where a class has none.
    expect(ok(await admin.post('/api/academics/sections/defaults', { academicYearId: lk.years[0].id })).created).toBe(0);
  });
});

describe('class-wise fees, roll numbers and safe deletes', () => {
  it('applies the class fee structure automatically at admission and bills immediately', async () => {
    const admin = await new Client(app).login('principal', 'Principal123');
    const st = ok(await admin.get('/api/fees/structure'));
    const c3 = st.rows.find((r: any) => r.className === 'Class 3');
    const nur = st.rows.find((r: any) => r.className === 'Nursery');
    ok(await admin.put('/api/fees/structure', { academicYearId: st.year.id, rows: [
      { classLevelId: c3.classLevelId, amounts: { ADMISSION: '2500', TUITION: '1500', BOOKS: '1200' } },
      { classLevelId: nur.classLevelId, amounts: { ADMISSION: '2000', TUITION: '1000' } }], hostel: { HOSTEL: '4000' } }));
    const lk = ok(await admin.get('/api/settings/lookups'));
    const sec3 = lk.sections.find((x: any) => x.class_name === 'Class 3');
    const admit = async (firstName: string, extra: any = {}) => ok(await admin.post('/api/students', { firstName, dob: '2018-02-02', guardians: [{ name: 'P', relation: 'Father', phone: '9000022222' }],
      enrollment: { sectionId: sec3.id, residency: 'day_scholar', transportOpted: false }, password: 'child123', ...extra }), 201);
    const z = await admit('Zoya');
    expect(z.outstandingPaise).toBeGreaterThanOrEqual(2500_00 + 1500_00); // admission + at least one month's tuition, billed at once
    expect(z.mustChange).toBe(false);
    const a = await admit('Aman', { enrollment: { sectionId: sec3.id, residency: 'hostel', transportOpted: false } });
    const stmt = ok(await admin.get(`/api/fees/students/${a.student.id}/statement`));
    expect(stmt.structure.map((x: any) => x.category)).toContain('Hostel Charges'); // hostel plan added for a hostel resident
    // Roll numbers: in admission order 1, 2 … then re-numbered alphabetically on request.
    expect([z.enrollment.roll_no, a.enrollment.roll_no]).toEqual([1, 2]);
    ok(await admin.post(`/api/academics/sections/${sec3.id}/renumber`, { order: 'alphabetical' }));
    const list = ok(await admin.get(`/api/academics/sections/${sec3.id}/students`));
    expect(list.map((x: any) => x.first_name)).toEqual(['Aman', 'Zoya']);
    // The student logs in with the ID and the password the Principal chose.
    await new Client(app).login(z.username, 'child123');
    // Safe deletes: unused items go, used ones are refused with a clear message.
    const sub = ok(await admin.post('/api/settings/subjects', { code: 'MUSIC', name: 'Music' }), 201);
    ok(await admin.del(`/api/settings/subjects/${sub.id}`));
    const eng = lk.subjects.find((x: any) => x.code === 'ENG');
    const t = ok(await admin.post('/api/teachers', { firstName: 'Temp', password: 'teach123' }), 201);
    ok(await admin.post('/api/academics/assignments', { teacherId: t.teacher.id, items: [{ sectionId: sec3.id, subjectId: eng.id }] }), 201);
    const refused = await admin.del(`/api/settings/subjects/${eng.id}`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/inactive/);
    ok(await admin.del(`/api/teachers/${t.teacher.id}`)); // no recorded work yet → allowed
    expect((await admin.del(`/api/academics/sections/${sec3.id}`)).status).toBe(400); // students enrolled
    ok(await admin.del(`/api/students/${z.student.id}`)); // no payments/attendance yet → allowed
    ok(await admin.post('/api/fees/payments', { studentId: a.student.id, amount: '100', mode: 'cash' }), 201);
    expect((await admin.del(`/api/students/${a.student.id}`)).status).toBe(400); // has a payment → refused
  });
});

describe('demo data', () => {
  it('can be seeded and removed without touching real records', async () => {
    const { removeDemo } = await import('../server/seed/demo.js');
    const admin = await new Client(app).login('principal', 'Principal123');
    const seeded = ok(await admin.post('/api/settings/demo', { password: 'demo1234' }));
    expect(seeded.summary.students).toBeGreaterThanOrEqual(26);
    expect(seeded.summary.students).toBeLessThanOrEqual(40);
    expect(seeded.summary.payments).toBeGreaterThan(0);
    expect(ok(await admin.get('/api/dashboard/admin')).demoLoaded).toBe(true);
    // Sample accounts use the chosen password; results and fees are visible in the portals.
    const stu = await new Client(app).login(seeded.students.find((s: any) => s.className === '5A').username, 'demo1234');
    expect(ok(await stu.get('/api/me/results')).length).toBeGreaterThan(0);
    expect(ok(await stu.get('/api/me/fees')).payments.length).toBeGreaterThanOrEqual(0);
    const tch = await new Client(app).login(seeded.teachers[0].username, 'demo1234');
    expect(ok(await tch.get('/api/dashboard/teacher')).assignments.length).toBeGreaterThan(0);
    expect((await admin.post('/api/settings/demo', { password: 'demo1234' })).status).toBe(400);
    const y = (await pool.query('SELECT id FROM academic_years WHERE is_current')).rows[0];
    const sec = (await pool.query(`SELECT id FROM sections WHERE academic_year_id = $1 LIMIT 1`, [y.id])).rows[0];
    // A real student admitted into a demo-created section keeps that section alive.
    const real = ok(await admin.post('/api/students', { firstName: 'Real', lastName: 'Child', dob: '2016-01-01', guardians: [{ name: 'Parent', relation: 'Mother', phone: '9000011111' }],
      enrollment: { sectionId: sec.id, residency: 'day_scholar', transportOpted: false } }), 201);
    ok(await admin.post('/api/fees/invoices/generate', { fromMonth: new Date().toISOString().slice(0, 7), toMonth: new Date().toISOString().slice(0, 7) }));
    await removeDemo(() => {});
    const left = (await pool.query('SELECT count(*)::int AS n FROM students WHERE is_demo')).rows[0].n;
    expect(left).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM users WHERE is_demo')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT id FROM students WHERE id = $1', [real.student.id])).rows).toHaveLength(1);
    expect((await pool.query('SELECT id FROM sections WHERE id = $1', [sec.id])).rows).toHaveLength(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM exams`)).rows[0].n).toBe(0);
    // School structure stays after removing sample data.
    expect((await pool.query(`SELECT count(*)::int AS n FROM sections`)).rows[0].n).toBeGreaterThanOrEqual(13);
    expect((await pool.query(`SELECT count(*)::int AS n FROM academic_years`)).rows[0].n).toBe(1);
  }, 180000);
});
