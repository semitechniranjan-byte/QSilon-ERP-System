import { one, type Db, pool } from '../db/pool.js';
import { badRequest } from './errors.js';

/**
 * Make sure a current academic year exists: if there are no years, create the current session with all classes;
 * if years exist but none is marked current, mark the most recent one current.
 */
export async function ensureCurrentYear() {
  const ok = await one(`SELECT y.id, EXISTS (SELECT 1 FROM sections s WHERE s.academic_year_id = y.id) AS has_sections FROM academic_years y WHERE y.is_current`);
  if (ok?.has_sections) return;
  const { bootstrapAcademics, createDefaultSections } = await import('../services/setup.js');
  if (!ok) {
    await bootstrapAcademics(() => {});
    await pool.query(`UPDATE academic_years SET is_current = true, status = 'active'
                       WHERE id = (SELECT id FROM academic_years ORDER BY start_date DESC LIMIT 1)
                         AND NOT EXISTS (SELECT 1 FROM academic_years WHERE is_current)`);
  }
  // A current year without any class sections is not usable: add Section A for every active class.
  const y = await one(`SELECT y.id FROM academic_years y WHERE y.is_current AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.academic_year_id = y.id)`);
  if (y) await createDefaultSections(pool, y.id);
}

export async function currentYear(db: Db = pool): Promise<{ id: number; name: string; start_date: string; end_date: string }> {
  let y = await one('SELECT id, name, start_date, end_date FROM academic_years WHERE is_current', [], db);
  if (!y && db === pool) {
    await ensureCurrentYear();
    y = await one('SELECT id, name, start_date, end_date FROM academic_years WHERE is_current', [], db);
  }
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
