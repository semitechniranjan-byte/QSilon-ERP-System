import { assertConfig, config } from './config.js';
assertConfig();
const { createApp } = await import('./app.js');
const { migrate } = await import('./db/migrate.js');

if (process.env.AUTO_MIGRATE !== 'false' && !config.isProd) await migrate();
const app = createApp();
app.listen(config.port, '0.0.0.0', () => console.log(`School Management System API listening on :${config.port}`));
