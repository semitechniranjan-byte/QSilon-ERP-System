import { one, pool } from './db/pool.js';
import { hashPassword } from './lib/passwords.js';

/**
 * Creates the Principal/administrator account from ADMIN_USERNAME / ADMIN_PASSWORD (set in the host's
 * environment settings) when no administrator exists yet. Never overwrites an existing account.
 */
export async function bootstrapAdmin(log: (m: string) => void = console.log) {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return log('ADMIN_USERNAME must be 3–40 letters, digits, dot, dash or underscore. Skipped.');
  if (password.length < 8) return log('ADMIN_PASSWORD must be at least 8 characters. Skipped.');
  const existing = await one(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  if (existing) return;
  await pool.query(
    `INSERT INTO users (username, password_hash, role, display_name, must_change_password) VALUES ($1,$2,'admin',$3,false) ON CONFLICT (username) DO NOTHING`,
    [username, await hashPassword(password), process.env.ADMIN_NAME?.trim() || 'Principal'],
  );
  log(`Administrator account "${username}" created from ADMIN_USERNAME / ADMIN_PASSWORD.`);
}
