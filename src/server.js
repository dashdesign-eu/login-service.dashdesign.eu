import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8080';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dashdesign-login-service', ts: new Date().toISOString() });
});

app.post('/auth/email/login', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email_required' });
  return res.json({
    ok: true,
    mode: 'stub',
    message: 'Email login scaffolding active. Integrate passwordless/otp next.',
    user: { id: `email:${email}`, email }
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
  const { hometown, birthdate, agbAccepted } = req.body || {};
  if (!hometown || !birthdate || typeof agbAccepted !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'missing_required_fields' });
  }
  return res.json({
    ok: true,
    message: 'Onboarding profile scaffold saved.',
    profile: { hometown, birthdate, agbAccepted }
  });
});

app.listen(PORT, () => {
  console.log(`login-service listening on ${APP_BASE_URL} (port ${PORT})`);
});
