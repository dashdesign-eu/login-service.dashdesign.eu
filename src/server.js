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
const REDIRECT_TOKEN_TTL_SECONDS = Number(process.env.REDIRECT_TOKEN_TTL_SECONDS || 120);
const REDIRECT_ALLOWED_ORIGINS = String(process.env.REDIRECT_ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);

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

function safeReturnTo(input) {
  if (!input) return null;
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    if (!REDIRECT_ALLOWED_ORIGINS.length) return url.toString();
    const origin = url.origin;
    return REDIRECT_ALLOWED_ORIGINS.includes(origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function issueRedirectCallbackToken(userId, returnTo) {
  const callbackToken = crypto.randomBytes(32).toString('hex');
  const callbackTokenHash = sha256(callbackToken);
  await pool.query(
    `INSERT INTO auth_redirect_tokens (user_id, callback_token_hash, return_to, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
    [userId, callbackTokenHash, returnTo, String(REDIRECT_TOKEN_TTL_SECONDS)]
  );
  return callbackToken;
}

async function performPasswordLogin(username, password) {
  const normalized = String(username).toLowerCase().trim();
  const userId = `email:${normalized}`;

  const q = await pool.query(
    `SELECT u.id, u.email, u.provider, c.password_hash
     FROM users u
     LEFT JOIN auth_credentials c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (q.rowCount === 0) return { ok: false, status: 401, error: 'invalid_credentials' };
  const user = q.rows[0];
  if (!user.password_hash) return { ok: false, status: 401, error: 'password_not_set' };

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return { ok: false, status: 401, error: 'invalid_credentials' };

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const payloadUser = { id: user.id, email: user.email, provider: user.provider };
  const { accessToken, refreshToken, roles } = issueTokens(payloadUser);
  await saveRefreshToken(user.id, refreshToken);

  return { ok: true, user: payloadUser, accessToken, refreshToken, roles };
}

function renderPortalHtml({ returnTo = '' } = {}) {
  const escaped = JSON.stringify(returnTo || '');
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Login</title>
  <style>
    body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f1116;color:#fff;margin:0}
    .wrap{max-width:460px;margin:40px auto;padding:24px}
    .card{background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:20px}
    input,button{width:100%;padding:12px;border-radius:10px;border:1px solid #363d50;background:#0f1116;color:#fff}
    button{cursor:pointer;background:#6d5efc;border:none;margin-top:10px}
    .ghost{background:#222839}
    .muted{color:#aab0c0;font-size:13px}
    .err{background:#431f24;border:1px solid #6d2d36;padding:10px;border-radius:8px;margin:10px 0}
    .row{display:flex;gap:10px}
    .row > *{flex:1}
    a{color:#9bb3ff}
  </style>
</head>
<body>
  <div class="wrap">
    <h2>dashdesign Login</h2>
    <div class="card">
      <p class="muted">Melde dich mit deinem dashdesign Account an.</p>
      <form id="f">
        <label>E-Mail</label><br/>
        <input required type="email" id="u"/><br/><br/>
        <label>Passwort</label><br/>
        <input required type="password" id="p"/>
        <div id="err"></div>
        <button type="submit">Anmelden (E-Mail)</button>
        <div class="row">
          <button class="ghost" id="g" type="button">Google</button>
          <button class="ghost" id="a" type="button">Apple</button>
        </div>
      </form>
      <p class="muted" style="margin-top:10px">Nach Login ohne returnTo: <a href="/account">/account</a></p>
    </div>
  </div>
<script>
const returnTo = ${escaped};
const err = (m='') => document.getElementById('err').innerHTML = m ? '<div class="err">'+m+'</div>' : '';

document.getElementById('g').onclick = () => {
  const q = returnTo ? ('?returnTo=' + encodeURIComponent(returnTo)) : '';
  location.href = '/auth/google/start' + q;
};
document.getElementById('a').onclick = () => {
  const q = returnTo ? ('?returnTo=' + encodeURIComponent(returnTo)) : '';
  location.href = '/auth/apple/start' + q;
};

document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  err('');
  const username = document.getElementById('u').value.trim();
  const password = document.getElementById('p').value;
  const endpoint = returnTo ? '/auth/redirect/complete' : '/auth/login';
  const body = returnTo ? { username, password, returnTo } : { username, password };
  const res = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return err(data?.error || 'login_failed');

  if (returnTo) {
    location.href = data.redirectTo;
    return;
  }

  const token = String(data.token || '').replace(/^Bearer\s+/i, '');
  if (token) localStorage.setItem('dashdesign_access_token', token);
  location.href = '/account';
};
</script>
</body>
</html>`;
}

function renderAccountHtml() {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Account</title>
  <style>body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f1116;color:#fff;margin:0}.wrap{max-width:680px;margin:40px auto;padding:24px}.card{background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:20px}pre{white-space:pre-wrap;background:#0f1116;border:1px solid #2a2f3d;padding:12px;border-radius:8px}button{padding:10px 14px;border-radius:8px;border:none;background:#6d5efc;color:#fff;cursor:pointer}</style>
</head>
<body>
  <div class="wrap">
    <h2>Account</h2>
    <div class="card">
      <p>Aktuelle Session:</p>
      <pre id="out">Lade…</pre>
      <button id="logout">Logout lokal</button>
    </div>
  </div>
<script>
async function load() {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) { document.getElementById('out').textContent = 'Nicht angemeldet. Bitte /login öffnen.'; return; }
  const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  document.getElementById('out').textContent = JSON.stringify(data?.user || data, null, 2);
}
load();
document.getElementById('logout').onclick = () => { localStorage.removeItem('dashdesign_access_token'); location.reload(); };
</script>
</body>
</html>`;
}

app.get('/', (_req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const returnTo = safeReturnTo(req.query?.returnTo);
  if (req.query?.returnTo && !returnTo) return res.status(400).send('invalid_return_to');
  res.type('html').send(renderPortalHtml({ returnTo: returnTo || '' }));
});

app.get('/account', (_req, res) => {
  res.type('html').send(renderAccountHtml());
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

  const result = await performPasswordLogin(username, password);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  await audit(req, 'login_success', result.user.id, {});
  return res.json({ ok: true, token: `Bearer ${result.accessToken}`, refreshToken: result.refreshToken, payload: { ...result.user, roles: result.roles } });
});

app.get('/auth/redirect/start', (req, res) => {
  const returnTo = safeReturnTo(req.query?.returnTo);
  if (!returnTo) return res.status(400).json({ ok: false, error: 'invalid_return_to' });
  res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
});

app.post('/auth/redirect/complete', authLimiter, async (req, res) => {
  const { username, password, returnTo } = req.body || {};
  const safe = safeReturnTo(returnTo);
  if (!username || !password || !safe) return res.status(400).json({ ok: false, error: 'invalid_input' });

  const result = await performPasswordLogin(username, password);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  const callbackToken = await issueRedirectCallbackToken(result.user.id, safe);
  const redirectUrl = new URL(safe);
  redirectUrl.searchParams.set('callbackToken', callbackToken);

  await audit(req, 'redirect_login_success', result.user.id, { returnTo: safe });
  return res.json({ ok: true, redirectTo: redirectUrl.toString() });
});

app.post('/auth/redirect/exchange', authLimiter, async (req, res) => {
  const { callbackToken, returnTo } = req.body || {};
  const safe = safeReturnTo(returnTo);
  if (!callbackToken || !safe) return res.status(400).json({ ok: false, error: 'invalid_input' });

  const tokenHash = sha256(callbackToken);
  const q = await pool.query(
    `SELECT id, user_id, return_to, expires_at, consumed_at
     FROM auth_redirect_tokens
     WHERE callback_token_hash = $1
     ORDER BY id DESC LIMIT 1`,
    [tokenHash]
  );

  if (q.rowCount === 0) return res.status(401).json({ ok: false, error: 'callback_invalid' });
  const row = q.rows[0];
  if (row.consumed_at) return res.status(401).json({ ok: false, error: 'callback_consumed' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(401).json({ ok: false, error: 'callback_expired' });
  if (String(row.return_to) !== String(safe)) return res.status(401).json({ ok: false, error: 'callback_return_to_mismatch' });

  const userQ = await pool.query('SELECT id, email, provider FROM users WHERE id = $1', [row.user_id]);
  if (userQ.rowCount === 0) return res.status(404).json({ ok: false, error: 'user_not_found' });
  const user = userQ.rows[0];

  const { accessToken, refreshToken, roles } = issueTokens(user);
  await saveRefreshToken(user.id, refreshToken);
  await pool.query('UPDATE auth_redirect_tokens SET consumed_at = NOW() WHERE id = $1', [row.id]);
  await audit(req, 'redirect_exchange_success', user.id, { returnTo: safe });

  return res.json({ ok: true, token: `Bearer ${accessToken}`, refreshToken, payload: { ...user, roles } });
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

app.get('/auth/google/start', (req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) return res.status(503).json({ ok: false, error: 'google_not_configured' });
  return res.json({ ok: true, message: 'Google start ready. OAuth redirect wiring next.', returnTo: req.query?.returnTo || null });
});

app.get('/auth/google/callback', (_req, res) => {
  res.json({ ok: true, mode: 'stub', message: 'Google callback scaffold endpoint.' });
});

app.get('/auth/apple/start', (req, res) => {
  const configured = !!(process.env.APPLE_TEAM_ID && process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID);
  if (!configured) return res.status(503).json({ ok: false, error: 'apple_not_configured' });
  return res.json({ ok: true, message: 'Apple start ready. OAuth redirect wiring next.', returnTo: req.query?.returnTo || null });
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
