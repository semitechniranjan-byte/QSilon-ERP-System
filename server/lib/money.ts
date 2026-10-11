/** All money is stored and computed as integer paise. Rupee strings are parsed without floating point. */
export function rupeesToPaise(input: string | number): number {
  const s = String(input).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) throw new Error('Invalid amount');
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
}
export function formatPaise(p: number): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const r = rupees.toLocaleString('en-IN');
  return `${neg ? '-' : ''}₹${r}.${String(paise).padStart(2, '0')}`;
}
/** Percentage discount in basis points, rounded half-up to the paise. */
export function percentOf(amountPaise: number, bp: number): number {
  return Math.floor((amountPaise * bp + 5000) / 10000);
}
