import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://sms:sms_dev@localhost:5432/sms_test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';

export async function freshApp(): Promise<Express> {
  const { pool } = await import('../server/db/pool.js');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { migrate } = await import('../server/db/migrate.js');
  await migrate(() => {});
  const { createApp } = await import('../server/app.js');
  return createApp();
}

export class Client {
  agent: ReturnType<typeof request.agent>;
  csrf = '';
  constructor(app: Express) { this.agent = request.agent(app); }
  async init() { const r = await this.agent.get('/api/auth/me'); this.csrf = r.body.csrfToken; return this; }
  get(url: string) { return this.agent.get(url); }
  post(url: string, body?: unknown) { return this.agent.post(url).set('x-csrf-token', this.csrf).send(body as object); }
  put(url: string, body?: unknown) { return this.agent.put(url).set('x-csrf-token', this.csrf).send(body as object); }
  del(url: string) { return this.agent.delete(url).set('x-csrf-token', this.csrf); }
  async login(identifier: string, password: string) {
    await this.init();
    const r = await this.post('/api/auth/login', { identifier, password });
    if (r.status !== 200) throw new Error(`login failed for ${identifier}: ${r.status} ${JSON.stringify(r.body)}`);
    await this.init();
    return this;
  }
  /** Log in with a temporary password and set a permanent one. */
  async firstLogin(identifier: string, temp: string, newPassword: string) {
    await this.login(identifier, temp);
    const r = await this.post('/api/auth/change-password', { currentPassword: temp, newPassword });
    if (r.status !== 200) throw new Error(`change password failed: ${JSON.stringify(r.body)}`);
    return this.login(identifier, newPassword);
  }
}

export function ok(r: request.Response, status = 200) {
  if (r.status !== status) throw new Error(`Expected ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}
