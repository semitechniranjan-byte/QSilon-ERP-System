import pg from 'pg';
import { config } from '../config.js';

// BIGINT (int8) values used for ids and paise fit safely in JS numbers for this application's ranges.
pg.types.setTypeParser(20, (v) => Number(v));
// NUMERIC (marks, percentages) as JS numbers.
pg.types.setTypeParser(1700, (v) => Number(v));
// DATE as plain 'YYYY-MM-DD' strings, avoiding timezone shifts.
pg.types.setTypeParser(1082, (v) => v);

function sslOption(url: string): pg.PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (/sslmode=/.test(url)) return undefined; // let the connection string decide
  let host = '';
  try { host = new URL(url).hostname; } catch { /* ignore */ }
  const remote = host && !['localhost', '127.0.0.1', '::1'].includes(host) && host.includes('.');
  if (process.env.DATABASE_SSL === 'true' || remote) {
    return { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== 'true' };
  }
  return undefined;
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: sslOption(config.databaseUrl),
  max: Number(process.env.DB_POOL_MAX || 10),
  options: config.dbSchema ? `-c search_path=${config.dbSchema},public` : undefined,
});

export type Db = pg.Pool | pg.PoolClient;

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query<T>(text, params as any[]);
  return r.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | undefined> {
  const r = await db.query<T>(text, params as any[]);
  return r.rows[0];
}

/** Run fn inside a transaction. Rolls back on any error. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
