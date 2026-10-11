import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader for local development; production values come from the host's environment settings.
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile) && process.env.NODE_ENV !== 'test') {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  databaseUrl: process.env.DATABASE_URL || '',
  dbSchema: process.env.DB_SCHEMA || '',
  sessionSecret: process.env.SESSION_SECRET || (isProd ? '' : 'dev-only-session-secret-not-for-production'),
  setupToken: process.env.SETUP_TOKEN || '',
  port: Number(process.env.PORT || (isProd ? 5000 : process.env.API_PORT || 3001)),
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_HOURS || 8) * 3600 * 1000,
  maxUploadBytes: 5 * 1024 * 1024,
};

export function assertConfig() {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See README.md > Configuration.`);
  }
  if (config.dbSchema && !/^[a-z_][a-z0-9_]{0,40}$/.test(config.dbSchema)) {
    throw new Error('DB_SCHEMA must be a lowercase identifier (letters, digits, underscore).');
  }
}
