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

describe('demo data', () => {
  it('can be seeded and removed without touching real records', async () => {
    const { seedDemo, removeDemo } = await import('../server/seed/demo.js');
    const admin = await new Client(app).login('principal', 'Principal123');
    await seedDemo();
    const y = (await pool.query('SELECT id FROM academic_years WHERE is_current')).rows[0];
    const sec = (await pool.query(`SELECT id FROM sections WHERE academic_year_id = $1 LIMIT 1`, [y.id])).rows[0];
    // A real student admitted into a demo-created section keeps that section alive.
    const real = ok(await admin.post('/api/students', { firstName: 'Real', lastName: 'Child', dob: '2016-01-01', guardians: [{ name: 'Parent', relation: 'Mother', phone: '9000011111' }],
      enrollment: { sectionId: sec.id, residency: 'day_scholar', transportOpted: false } }), 201);
    ok(await admin.post('/api/fees/invoices/generate', { fromMonth: new Date().toISOString().slice(0, 7), toMonth: new Date().toISOString().slice(0, 7) }));
    await removeDemo();
    const left = (await pool.query('SELECT count(*)::int AS n FROM students WHERE is_demo')).rows[0].n;
    expect(left).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM users WHERE is_demo')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT id FROM students WHERE id = $1', [real.student.id])).rows).toHaveLength(1);
    expect((await pool.query('SELECT id FROM sections WHERE id = $1', [sec.id])).rows).toHaveLength(1);
  });
});
