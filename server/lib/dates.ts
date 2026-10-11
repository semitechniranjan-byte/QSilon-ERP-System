/** Today's date in India Standard Time as YYYY-MM-DD (school operations follow local dates). */
export function todayIST(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function monthsBetweenInclusive(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  for (let cur = fromYm; cur <= toYm; cur = addMonths(cur, 1)) out.push(cur);
  return out;
}
export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
