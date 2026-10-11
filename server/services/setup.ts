import type { Db } from '../db/pool.js';
import { one, pool, q, tx } from '../db/pool.js';
import { todayIST } from '../lib/dates.js';

const DEFAULT_SUBJECTS: [string, string, string][] = [
  ['ENG', 'English', 'अंग्रेज़ी'], ['HIN', 'Hindi', 'हिन्दी'], ['MATH', 'Mathematics', 'गणित'], ['EVS', 'Environmental Studies', 'पर्यावरण अध्ययन'],
  ['SCI', 'Science', 'विज्ञान'], ['SST', 'Social Science', 'सामाजिक विज्ञान'], ['COMP', 'Computer', 'कंप्यूटर'],
  ['PHY', 'Physics', 'भौतिकी'], ['CHEM', 'Chemistry', 'रसायन'], ['BIO', 'Biology', 'जीव विज्ञान'],
];
/** Typical subjects by class code; only used to pre-fill a class that has no subjects yet. */
function subjectsFor(code: string): string[] {
  const n = code === 'NUR' ? 0 : Number(code);
  if (Number.isNaN(n)) return ['ENG', 'HIN', 'MATH'];
  if (n === 0) return ['ENG', 'HIN', 'MATH'];
  if (n <= 2) return ['ENG', 'HIN', 'MATH', 'EVS'];
  if (n <= 5) return ['ENG', 'HIN', 'MATH', 'EVS', 'COMP'];
  if (n <= 8) return ['ENG', 'HIN', 'MATH', 'SCI', 'SST', 'COMP'];
  if (n <= 10) return ['ENG', 'HIN', 'MATH', 'SCI', 'SST'];
  return ['ENG', 'PHY', 'CHEM', 'MATH', 'BIO'];
}

/** Current academic session (April–March) for today's date. */
export function currentSessionDates(today = todayIST()) {
  const y = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  return { name: `${y}-${String(y + 1).slice(2)}`, start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

/**
 * Create "Section A" (and default subjects) for every active class in the given year where the class has no
 * section yet. Never changes or removes existing sections. Returns the number of sections created.
 */
export async function createDefaultSections(c: Db, yearId: number, opts: { sectionName?: string; boardCode?: string; mediumCode?: string } = {}) {
  const board = await one(`SELECT id FROM boards WHERE code = $1`, [opts.boardCode ?? 'CBSE'], c);
  const medium = await one(`SELECT id FROM mediums WHERE code = $1`, [opts.mediumCode ?? 'EN'], c);
  for (const [code, name, hi] of DEFAULT_SUBJECTS) {
    await c.query('INSERT INTO subjects (code, name, name_hi) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING', [code, name, hi]);
  }
  const subjects = Object.fromEntries((await q('SELECT code, id FROM subjects', [], c)).map((r) => [r.code, r.id]));
  const classes = await q(`SELECT id, code FROM class_levels cl WHERE is_active
                            AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.class_level_id = cl.id AND s.academic_year_id = $1) ORDER BY sort_order`, [yearId], c);
  for (const cl of classes) {
    await c.query(`INSERT INTO sections (academic_year_id, class_level_id, name, board_id, medium_id, capacity) VALUES ($1,$2,$3,$4,$5,40)
                   ON CONFLICT (academic_year_id, class_level_id, name) DO NOTHING`, [yearId, cl.id, opts.sectionName ?? 'A', board?.id ?? null, medium?.id ?? null]);
    const has = await one('SELECT 1 FROM class_subjects WHERE academic_year_id = $1 AND class_level_id = $2 LIMIT 1', [yearId, cl.id], c);
    if (!has) {
      for (const sc of subjectsFor(cl.code)) {
        if (subjects[sc]) await c.query(`INSERT INTO class_subjects (academic_year_id, class_level_id, subject_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [yearId, cl.id, subjects[sc]]);
      }
    }
  }
  return classes.length;
}

/** First start: if no academic year exists, create the current session with Section A for every active class. */
export async function bootstrapAcademics(log: (m: string) => void = console.log) {
  const exists = await one('SELECT 1 FROM academic_years LIMIT 1');
  if (exists) return;
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(4004)');
    if (await one('SELECT 1 FROM academic_years LIMIT 1', [], c)) return;
    const d = currentSessionDates();
    const y = await one(`INSERT INTO academic_years (name, start_date, end_date, is_current, status) VALUES ($1,$2,$3,true,'active') RETURNING id`, [d.name, d.start, d.end], c);
    const n = await createDefaultSections(c, y.id);
    log(`Created academic year ${d.name} with Section A for ${n} classes.`);
  });
  void pool;
}
