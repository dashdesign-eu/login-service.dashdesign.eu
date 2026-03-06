import express from 'express';
import cors from 'cors';
import { initDb, pool } from './db.js';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8080';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  const db = await pool.query('SELECT NOW() as now');
  res.json({ ok: true, service: 'dashdesign-login-service', ts: new Date().toISOString(), dbNow: db.rows[0].now });
});

app.post('/auth/email/login', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email_required' });

  const userId = `email:${email.toLowerCase().trim()}`;
  const normalized = email.toLowerCase().trim();

  await pool.query(
    `INSERT INTO users (id, email, provider, last_login_at)
     VALUES ($1, $2, 'email', NOW())
     ON CONFLICT (id) DO UPDATE SET last_login_at = NOW(), email = EXCLUDED.email`,
    [userId, normalized]
  );

  const { rows } = await pool.query('SELECT id, email, provider, last_login_at FROM users WHERE id = $1', [userId]);

  return res.json({
    ok: true,
    mode: 'stub',
    message: 'Email login scaffolding active. Integrate passwordless/otp next.',
    user: rows[0]
  });
});

app.get('/auth/google/start', (_req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) return res.status(503).json({ ok: false, error: 'google_not_configured' });
  return res.json({ ok: true, message: 'Google start ready. OAuth redirect wiring next.' });
});

app.get('/auth/google/callback', (_req, res) => {
  res.json({ ok: true, mode: 'stub', message: 'Google callback scaffold endpoint.' });
});

app.get('/auth/apple/start', (_req, res) => {
  const configured = !!(process.env.APPLE_TEAM_ID && process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID);
  if (!configured) return res.status(503).json({ ok: false, error: 'apple_not_configured' });
  return res.json({ ok: true, message: 'Apple start ready. OAuth redirect wiring next.' });
});

app.get('/auth/apple/callback', (_req, res) => {
  res.json({ ok: true, mode: 'stub', message: 'Apple callback scaffold endpoint.' });
});

app.post('/onboarding/profile', async (req, res) => {
  const { userId, hometown, birthdate, agbAccepted } = req.body || {};
  if (!userId || !hometown || !birthdate || typeof agbAccepted !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'missing_required_fields' });
  }

  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rowCount === 0) {
    return res.status(404).json({ ok: false, error: 'user_not_found' });
  }

  await pool.query(
    `INSERT INTO onboarding_profiles (user_id, hometown, birthdate, agb_accepted, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET hometown = EXCLUDED.hometown,
         birthdate = EXCLUDED.birthdate,
         agb_accepted = EXCLUDED.agb_accepted,
         updated_at = NOW()`,
    [userId, hometown, birthdate, agbAccepted]
  );

  const { rows } = await pool.query(
    'SELECT user_id as "userId", hometown, birthdate, agb_accepted as "agbAccepted", updated_at as "updatedAt" FROM onboarding_profiles WHERE user_id = $1',
    [userId]
  );

  return res.json({ ok: true, message: 'Onboarding profile saved.', profile: rows[0] });
});

app.post('/analytics/event', async (req, res) => {
  const { userId = null, eventType, payload = {} } = req.body || {};
  if (!eventType) return res.status(400).json({ ok: false, error: 'event_type_required' });

  await pool.query(
    'INSERT INTO analytics_events (user_id, event_type, payload) VALUES ($1, $2, $3::jsonb)',
    [userId, eventType, JSON.stringify(payload)]
  );

  return res.json({ ok: true });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`login-service listening on ${APP_BASE_URL} (port ${PORT})`);
  });
}

start().catch((err) => {
  console.error('Failed to start login-service:', err);
  process.exit(1);
});
