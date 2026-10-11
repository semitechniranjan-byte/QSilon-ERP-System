import { one, type Db, pool } from '../db/pool.js';
import { badRequest } from './errors.js';

export async function currentYear(db: Db = pool): Promise<{ id: number; name: string; start_date: string; end_date: string }> {
  const y = await one('SELECT id, name, start_date, end_date FROM academic_years WHERE is_current', [], db);
  if (!y) throw badRequest('No current academic year is configured. Create one under Settings > Academic Years.');
  return y;
}

export async function resolveYear(yearId: unknown, db: Db = pool) {
  if (yearId) {
    const y = await one('SELECT id, name, start_date, end_date FROM academic_years WHERE id = $1', [Number(yearId)], db);
    if (!y) throw badRequest('Unknown academic year.');
    return y;
  }
  return currentYear(db);
}

export async function settings(db: Db = pool) {
  return (await one('SELECT * FROM school_settings WHERE id = 1', [], db))!;
}
