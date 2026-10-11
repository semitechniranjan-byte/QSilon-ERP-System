import readline from 'node:readline/promises';
import { assertConfig } from './config.js';

assertConfig();
const { pool } = await import('./db/pool.js');
const { migrate } = await import('./db/migrate.js');
const cmd = process.argv[2];

async function prompt(q: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) (rl as any)._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); };
  const a = await rl.question(q);
  rl.close();
  if (hidden) process.stdout.write('\n');
  return a.trim();
}

try {
  if (cmd === 'migrate') {
    await migrate();
    console.log('Database is up to date.');
  } else if (cmd === 'create-admin') {
    await migrate(() => {});
    const { assertStrongPassword, hashPassword } = await import('./lib/passwords.js');
    const username = process.env.ADMIN_USERNAME || (await prompt('Admin username: '));
    const displayName = process.env.ADMIN_NAME || (await prompt('Full name: ')) || username;
    const password = process.env.ADMIN_PASSWORD || (await prompt('Password (min 8 chars, letters + numbers): ', true));
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw new Error('Username must be 3–40 letters, digits, dot, dash or underscore.');
    assertStrongPassword(password);
    await pool.query(
      `INSERT INTO users (username, password_hash, role, display_name, must_change_password) VALUES ($1,$2,'admin',$3,false)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', is_active = true, failed_attempts = 0, locked_until = NULL`,
      [username, await hashPassword(password), displayName]);
    console.log(`Administrator "${username}" is ready. Sign in at /login.`);
  } else if (cmd === 'seed-demo') {
    await migrate(() => {});
    const { seedDemo } = await import('./seed/demo.js');
    const r = await seedDemo({ password: process.env.DEMO_PASSWORD || null });
    console.log('\nTeachers (login ID):');
    for (const t of r.teachers) console.log(`  ${t.name.padEnd(20)} ${t.username}`);
    console.log('\nSome students (login ID):');
    for (const s of r.students) console.log(`  ${s.className.padEnd(4)} ${s.name.padEnd(20)} ${s.username}`);
    console.log(r.password ? '\nAll sample accounts use the DEMO_PASSWORD you provided.' : '\nSet DEMO_PASSWORD=... to give all sample accounts one password.');
  } else if (cmd === 'remove-demo') {
    const { removeDemo } = await import('./seed/demo.js');
    await removeDemo();
  } else {
    console.log('Usage: tsx server/cli.ts <migrate|create-admin|seed-demo|remove-demo>');
    process.exitCode = 1;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
