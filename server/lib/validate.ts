import { z } from 'zod';

export const id = z.coerce.number().int().positive();
export const optId = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable());
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
export const optDate = z.preprocess((v) => (v === '' || v === undefined ? null : v), date.nullable());
export const str = (max = 200) => z.string().trim().min(1, 'Required').max(max);
export const optStr = (max = 500) => z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().max(max).nullable());
export const phone = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, 'Invalid phone number').nullable());
export const email = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().email().max(200).nullable());
export const bool = z.preprocess((v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on', z.boolean());
/** Rupee amount as string or number, converted to integer paise without floating point. */
export const rupees = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount (up to 2 decimals)' });
    return z.NEVER;
  }
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
});
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
