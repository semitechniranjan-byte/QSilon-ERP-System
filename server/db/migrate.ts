import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool.js';
import { config } from '../config.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'server/db/migrations');

// Tables this application creates. If any exist in an un-migrated database we stop instead of touching them.
const OWNED_TABLES = ['users', 'students', 'teachers', 'sections', 'subjects', 'payments', 'receipts', 'attendance_records', 'fee_invoices', 'notices', 'files', 'session'];

export async function migrate(log: (m: string) => void = console.log) {
  const c = await pool.connect();
  try {
    if (config.dbSchema) await c.query(`CREATE SCHEMA IF NOT EXISTS ${config.dbSchema}`);
    // Only one migrator at a time.
    await c.query('SELECT pg_advisory_lock(727272)');
    const tracked = await c.query(`SELECT to_regclass('schema_migrations') AS t`);
    if (!tracked.rows[0].t) {
      const existing = await c.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
        [OWNED_TABLES],
      );
      if (existing.rows.length) {
        throw new Error(
          `The database already contains table(s) not created by this application: ${existing.rows.map((r) => r.table_name).join(', ')}. ` +
            'No changes were made. Set DB_SCHEMA (e.g. DB_SCHEMA=sms) to install into a separate schema, or review README.md > Existing databases.',
        );
      }
      await c.query(`CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    }
    const applied = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log(`applied ${f}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Migration ${f} failed and was rolled back: ${(e as Error).message}`);
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727272)').catch(() => {});
    c.release();
  }
}
