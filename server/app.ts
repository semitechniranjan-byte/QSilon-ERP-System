import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { errorHandler, notFound } from './lib/errors.js';
import { csrfProtect, loadUser, requireAuth } from './middleware/auth.js';
import { authRouter, setupRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { filesRouter } from './routes/files.js';
import { settingsRouter } from './routes/settings.js';
import { teachersRouter } from './routes/teachers.js';
import { studentsRouter } from './routes/students.js';
import { academicsRouter } from './routes/academics.js';
import { attendanceRouter } from './routes/attendance.js';
import { feesRouter } from './routes/fees.js';
import { hostelRouter } from './routes/hostel.js';
import { examsRouter } from './routes/exams.js';
import { learningRouter } from './routes/learning.js';
import { noticesRouter } from './routes/notices.js';
import { dashboardRouter } from './routes/dashboard.js';
import { reportsRouter } from './routes/reports.js';
import { meRouter } from './routes/me.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render's / Vite's proxy
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '1mb' }));

  const PgStore = connectPg(session);
  app.use(session({
    name: 'sms.sid',
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: config.isTest ? false : 15 * 60 }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : config.isProd, maxAge: config.sessionMaxAgeMs },
  }));

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  api.use(loadUser);
  api.use(csrfProtect);
  api.use('/auth', authRouter);
  api.use('/setup', setupRouter);
  api.use('/public', publicRouter);
  api.use('/files', filesRouter); // performs its own access checks (public files need no login)
  api.use(requireAuth);
  api.use('/settings', settingsRouter);
  api.use('/teachers', teachersRouter);
  api.use('/students', studentsRouter);
  api.use('/academics', academicsRouter);
  api.use('/attendance', attendanceRouter);
  api.use('/fees', feesRouter);
  api.use('/hostel', hostelRouter);
  api.use('/exams', examsRouter);
  api.use('/learning', learningRouter);
  api.use('/notices', noticesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/reports', reportsRouter);
  api.use('/me', meRouter);
  api.use((_req, _res, next) => next(notFound('API endpoint not found.')));
  app.use('/api', api);

  // Production: serve the built React app.
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
