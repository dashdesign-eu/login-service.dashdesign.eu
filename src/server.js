import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8080';
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'login-service.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users: {}, onboarding: {}, events: [] }, null, 2),
      'utf8'
    );
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dashdesign-login-service', ts: new Date().toISOString(), dataFile: DATA_FILE });
});

app.post('/auth/email/login', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email_required' });

  const store = readStore();
  const userId = `email:${email.toLowerCase().trim()}`;
  store.users[userId] = {
    id: userId,
    email: email.toLowerCase().trim(),
    provider: 'email',
    lastLoginAt: new Date().toISOString()
  };
  writeStore(store);

  return res.json({
    ok: true,
    mode: 'stub',
    message: 'Email login scaffolding active. Integrate passwordless/otp next.',
    user: store.users[userId]
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

app.post('/onboarding/profile', (req, res) => {
  const { userId, hometown, birthdate, agbAccepted } = req.body || {};
  if (!userId || !hometown || !birthdate || typeof agbAccepted !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'missing_required_fields' });
  }

  const store = readStore();
  store.onboarding[userId] = {
    userId,
    hometown,
    birthdate,
    agbAccepted,
    updatedAt: new Date().toISOString()
  };
  writeStore(store);

  return res.json({
    ok: true,
    message: 'Onboarding profile saved.',
    profile: store.onboarding[userId]
  });
});

app.listen(PORT, () => {
  ensureStore();
  console.log(`login-service listening on ${APP_BASE_URL} (port ${PORT})`);
});
