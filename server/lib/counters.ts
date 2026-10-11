import type { Db } from '../db/pool.js';

/** Transaction-safe increment. Callers must run inside a transaction for gapless numbering. */
export async function nextCounter(db: Db, key: string): Promise<number> {
  const r = await db.query(
    `INSERT INTO counters (key, value) VALUES ($1, 1)
     ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [key],
  );
  return Number(r.rows[0].value);
}

export const pad = (n: number, width = 4) => String(n).padStart(width, '0');
