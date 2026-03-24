import { createApp } from './app.js';
import { initDb } from './db.js';
import { ensureBootstrapAdmin } from './services/userService.js';
import { APP_BASE_URL, PORT } from './config/env.js';

async function start() {
  const app = createApp();

  await initDb();
  await ensureBootstrapAdmin();

  app.listen(PORT, () => {
    console.log(`login-service listening on ${APP_BASE_URL} (port ${PORT})`);
  });
}

start().catch((err) => {
  console.error('Failed to start login-service:', err);
  process.exit(1);
});
