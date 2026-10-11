import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { badRequest } from './errors.js';

const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

export const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', ROUNDS);
export const hashPassword = (p: string) => bcrypt.hash(p, ROUNDS);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export function assertStrongPassword(p: string) {
  if (typeof p !== 'string' || p.length < 8 || p.length > 128 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    throw badRequest('Password must be 8–128 characters and contain at least one letter and one number.');
  }
}

/** Readable temporary password (no ambiguous characters). Shown once to the administrator. */
export function tempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(10);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 5) + '-' + out.slice(5) + (/\d/.test(out) ? '' : '7');
}

/** Passwords chosen by the Principal for staff/student accounts: any text of 6–128 characters. */
export function assertAdminSetPassword(p: unknown): asserts p is string {
  if (typeof p !== 'string' || p.length < 6 || p.length > 128) throw badRequest('Password must be at least 6 characters.');
}

/** Use the password chosen by the administrator, or generate a temporary one that must be changed. */
export async function initialPassword(chosen?: string | null) {
  if (chosen) {
    assertAdminSetPassword(chosen);
    return { password: chosen, hash: await hashPassword(chosen), mustChange: false };
  }
  const pw = tempPassword();
  return { password: pw, hash: await hashPassword(pw), mustChange: true };
}
