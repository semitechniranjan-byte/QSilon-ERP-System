export function inr(paise: number | null | undefined) {
  if (paise == null) return '—';
  const n = Number(paise);
  const neg = n < 0;
  const a = Math.abs(n);
  return `${neg ? '-' : ''}₹${Math.floor(a / 100).toLocaleString('en-IN')}.${String(a % 100).padStart(2, '0')}`;
}
export const paiseToRupeeStr = (p: number) => (p / 100).toFixed(2);
export function fmtDate(d?: string | null) {
  if (!d) return '—';
  const s = d.slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
}
export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
export function todayISO() {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
}
export const fullName = (r: { first_name?: string; last_name?: string | null } | null | undefined) => (r ? [r.first_name, r.last_name].filter(Boolean).join(' ') : '');
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function titleCase(s?: string | null) {
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
