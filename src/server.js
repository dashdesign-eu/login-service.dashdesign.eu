import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { initDb, pool } from './db.js';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8080';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-me-access';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh';
const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TTL_SECONDS || 900);
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TTL_SECONDS || 2592000);
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);

const allowlist = (process.env.CORS_ALLOWLIST || APP_BASE_URL)
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cookieParser());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowlist.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '200kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

function parseRoleList(name) {
  return (process.env[name] || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

const MONITOR_ADMIN_EMAILS = parseRoleList('MONITOR_ADMIN_EMAILS');
const MONITOR_EDITOR_EMAILS = parseRoleList('MONITOR_EDITOR_EMAILS');
const MONITOR_VIEWER_EMAILS = parseRoleList('MONITOR_VIEWER_EMAILS');

function resolveRoles(email) {
  const normalized = String(email || '').toLowerCase().trim();
  const roles = new Set();
  if (MONITOR_VIEWER_EMAILS.includes(normalized)) roles.add('monitor_viewer');
  if (MONITOR_EDITOR_EMAILS.includes(normalized)) roles.add('monitor_editor');
  if (MONITOR_ADMIN_EMAILS.includes(normalized)) roles.add('admin');
  if (roles.has('admin')) roles.add('monitor_editor');
  if (roles.has('monitor_editor')) roles.add('monitor_viewer');
  return [...roles];
}

function readAccessClaims(req) {
  const auth = req.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET, {
      issuer: 'dashdesign-login-service',
      audience: 'dashdesign-apps',
    });
  } catch {
    return null;
  }
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function issueTokens(user) {
  const roles = resolveRoles(user.email);
  const accessToken = jwt.sign({ sub: user.id, email: user.email, provider: user.provider, roles }, JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL_SECONDS,
    issuer: 'dashdesign-login-service',
    audience: 'dashdesign-apps',
  });

  const refreshToken = jwt.sign({ sub: user.id, kind: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_SECONDS,
    issuer: 'dashdesign-login-service',
    audience: 'dashdesign-apps',
  });

  return { accessToken, refreshToken, roles: resolveRoles(user.email) };
}

async function saveRefreshToken(userId, refreshToken) {
  const tokenHash = sha256(refreshToken);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)`,
    [userId, tokenHash, String(REFRESH_TTL_SECONDS)]
  );
}

async function audit(req, action, userId = null, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, ip, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, action, req.ip || null, req.get('user-agent') || null, JSON.stringify(metadata)]
  );
}

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'dashdesign-login-service' });
});

app.get('/health', async (_req, res) => {
  const db = await pool.query('SELECT NOW() as now');
  res.json({ ok: true, service: 'dashdesign-login-service', ts: new Date().toISOString(), dbNow: db.rows[0].now });
});

app.post('/auth/email/register/start', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'invalid_input' });
  }

  const normalized = String(email).toLowerCase().trim();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);

  await pool.query(
    `INSERT INTO email_otp_codes (email, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [normalized, codeHash, String(OTP_TTL_MINUTES)]
  );

  await audit(req, 'register_start', null, { email: normalized });

  // TODO: replace with real email sender; codeHint only for bootstrap/testing.
  return res.json({ ok: true, codeHint: code });
});

app.post('/auth/email/register/verify', authLimiter, async (req, res) => {
  const { email, password, code } = req.body || {};
  if (!email || !password || !code) return res.status(400).json({ ok: false, error: 'invalid_input' });

  const normalized = String(email).toLowerCase().trim();
  const latest = await pool.query(
    `SELECT id, code_hash, expires_at, consumed_at
     FROM email_otp_codes
     WHERE email = $1
     ORDER BY id DESC LIMIT 1`,
    [normalized]
  );

  if (latest.rowCount === 0) return res.status(400).json({ ok: false, error: 'otp_not_found' });

  const otp = latest.rows[0];
  if (otp.consumed_at) return res.status(400).json({ ok: false, error: 'otp_consumed' });
  if (new Date(otp.expires_at).getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'otp_expired' });

  const valid = await bcrypt.compare(String(code), otp.code_hash);
  if (!valid) return res.status(400).json({ ok: false, error: 'otp_invalid' });

  const userId = `email:${normalized}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (id, email, provider, last_login_at)
     VALUES ($1, $2, 'email', NOW())
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, last_login_at = NOW()`,
    [userId, normalized]
  );

  await pool.query(
    `INSERT INTO auth_credentials (user_id, password_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [userId, passwordHash]
  );

  await pool.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id]);

  const user = { id: userId, email: normalized, provider: 'email' };
  const { accessToken, refreshToken, roles } = issueTokens(user);
  await saveRefreshToken(userId, refreshToken);
  await audit(req, 'register_success', userId, { email: normalized });

  return res.json({ ok: true, token: `Bearer ${accessToken}`, refreshToken, payload: { ...user, roles } });
});

app.post('/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'invalid_input' });

  const normalized = String(username).toLowerCase().trim();
  const userId = `email:${normalized}`;

  const q = await pool.query(
    `SELECT u.id, u.email, u.provider, c.password_hash
     FROM users u
     LEFT JOIN auth_credentials c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (q.rowCount === 0) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  const user = q.rows[0];
  if (!user.password_hash) return res.status(401).json({ ok: false, error: 'password_not_set' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const payloadUser = { id: user.id, email: user.email, provider: user.provider };
  const { accessToken, refreshToken, roles } = issueTokens(payloadUser);
  await saveRefreshToken(user.id, refreshToken);
  await audit(req, 'login_success', user.id, {});

  return res.json({ ok: true, token: `Bearer ${accessToken}`, refreshToken, payload: { ...payloadUser, roles } });
});

app.post('/auth/refresh', authLimiter, async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ ok: false, error: 'refresh_required' });

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'dashdesign-login-service', audience: 'dashdesign-apps' });
  } catch {
    return res.status(401).json({ ok: false, error: 'refresh_invalid' });
  }

  const tokenHash = sha256(refreshToken);
  const row = await pool.query(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 ORDER BY id DESC LIMIT 1`,
    [tokenHash]
  );
  if (row.rowCount === 0) return res.status(401).json({ ok: false, error: 'refresh_not_found' });
  const tok = row.rows[0];
  if (tok.revoked_at) return res.status(401).json({ ok: false, error: 'refresh_revoked' });
  if (new Date(tok.expires_at).getTime() < Date.now()) return res.status(401).json({ ok: false, error: 'refresh_expired' });

  const userQ = await pool.query('SELECT id, email, provider FROM users WHERE id = $1', [decoded.sub]);
  if (userQ.rowCount === 0) return res.status(401).json({ ok: false, error: 'user_not_found' });
  const user = userQ.rows[0];

  const { accessToken, refreshToken: newRefresh, roles } = issueTokens(user);
  await saveRefreshToken(user.id, newRefresh);
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [tok.id]);

  return res.json({ ok: true, token: `Bearer ${accessToken}`, refreshToken: newRefresh, payload: { ...user, roles } });
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


app.get('/auth/me', authLimiter, async (req, res) => {
  const claims = readAccessClaims(req);
  if (!claims) return res.status(401).json({ ok: false, error: 'auth_invalid' });
  const userQ = await pool.query('SELECT id, email, provider FROM users WHERE id = $1', [claims.sub]);
  if (userQ.rowCount === 0) return res.status(404).json({ ok: false, error: 'user_not_found' });
  const user = userQ.rows[0];
  const roles = resolveRoles(user.email);
  return res.json({ ok: true, user: { id: user.id, email: user.email, provider: user.provider, roles }, claims: { ...claims, roles } });
});

app.get('/auth/session', authLimiter, async (req, res) => {
  const claims = readAccessClaims(req);
  if (!claims) return res.status(401).json({ ok: false, error: 'auth_invalid' });
  return res.json({ ok: true, claims });
});

app.post('/onboarding/profile', authLimiter, async (req, res) => {
  const { userId, hometown, birthdate, agbAccepted } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'user_id_required' });

  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rowCount === 0) return res.status(404).json({ ok: false, error: 'user_not_found' });

  await pool.query(
    `INSERT INTO onboarding_profiles (user_id, hometown, birthdate, agb_accepted, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET hometown = COALESCE(EXCLUDED.hometown, onboarding_profiles.hometown),
         birthdate = COALESCE(EXCLUDED.birthdate, onboarding_profiles.birthdate),
         agb_accepted = COALESCE(EXCLUDED.agb_accepted, onboarding_profiles.agb_accepted),
         updated_at = NOW()`,
    [userId, hometown || null, birthdate || null, typeof agbAccepted === 'boolean' ? agbAccepted : null]
  );

  const { rows } = await pool.query(
    'SELECT user_id as "userId", hometown, birthdate, agb_accepted as "agbAccepted", updated_at as "updatedAt" FROM onboarding_profiles WHERE user_id = $1',
    [userId]
  );

  await audit(req, 'onboarding_update', userId, { hasHometown: !!rows[0]?.hometown, hasBirthdate: !!rows[0]?.birthdate, agbAccepted: !!rows[0]?.agbAccepted });

  return res.json({ ok: true, message: 'Onboarding profile saved.', profile: rows[0] });
});

app.post('/analytics/event', authLimiter, async (req, res) => {
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
