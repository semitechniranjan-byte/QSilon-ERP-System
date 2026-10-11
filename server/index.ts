import { assertConfig, config } from './config.js';
assertConfig();
const { createApp } = await import('./app.js');
const { migrate } = await import('./db/migrate.js');
const { bootstrapAdmin } = await import('./bootstrap.js');

// Development migrates automatically; in production migrations run in Render's pre-deploy step,
// or at startup when RUN_MIGRATIONS_ON_START=true (for plans without a pre-deploy command).
if ((!config.isProd && process.env.AUTO_MIGRATE !== 'false') || process.env.RUN_MIGRATIONS_ON_START === 'true') await migrate();
await bootstrapAdmin().catch((e) => console.error('Admin bootstrap failed:', e.message));
const app = createApp();
app.listen(config.port, '0.0.0.0', () => console.log(`Future Creations Public School – server listening on :${config.port}`));
