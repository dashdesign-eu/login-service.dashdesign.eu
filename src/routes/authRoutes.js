import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { pool } from '../db.js';
import { authLimiter } from '../middleware/authLimiter.js';
import { audit } from '../services/auditService.js';
import {
  HIDDEN_REGISTRATION_SECRET,
  OTP_TTL_MINUTES,
  JWT_REFRESH_SECRET,
  BOOTSTRAP_ADMIN_PROVIDER,
  GOOGLE_CONFIGURED,
  APPLE_CONFIGURED,
} from '../config/env.js';
import {
  readAccessClaims,
  issueTokens,
  saveRefreshToken,
  issueRedirectCallbackToken,
  performPasswordLogin,
} from '../services/authService.js';
import { upsertEmailUser } from '../services/userService.js';
import { safeReturnTo } from '../lib/urls.js';
import { sha256 } from '../lib/crypto.js';
import { resolveRoles } from '../lib/roles.js';

export function createAuthRouter() {
  const router = express.Router();

  router.post('/auth/email/register/start', authLimiter, async (req, res) => {
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

  router.post('/auth/email/register/verify', authLimiter, async (req, res) => {
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

    const user = await upsertEmailUser({ email: normalized, password, provider: 'email' });

    await pool.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id]);

    const { accessToken, refreshToken, roles } = issueTokens(user);
    await saveRefreshToken(user.id, refreshToken);
    await audit(req, 'register_success', user.id, { email: normalized });

    return res.json({ ok: true, token: `Bearer ${accessToken}`, refreshToken, payload: { ...user, roles } });
  });

  router.post('/auth/login', authLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'invalid_input' });

    const result = await performPasswordLogin(username, password);
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

    await audit(req, 'login_success', result.user.id, {});
    return res.json({
      ok: true,
      token: `Bearer ${result.accessToken}`,
      refreshToken: result.refreshToken,
      payload: { ...result.user, roles: result.roles },
    });
  });

  router.post('/internal/register', authLimiter, async (req, res) => {
    const token = req.get('x-bootstrap-token') || req.query?.token || '';
    const { email, password, admin } = req.body || {};
    if (!HIDDEN_REGISTRATION_SECRET) {
      return res.status(404).json({ ok: false, error: 'route_not_available' });
    }
    if (token !== HIDDEN_REGISTRATION_SECRET) {
      return res.status(404).json({ ok: false, error: 'route_not_found' });
    }
    if (!email || !password) return res.status(400).json({ ok: false, error: 'invalid_input' });
    if (String(password).length < 8) return res.status(400).json({ ok: false, error: 'password_too_short' });

    const provider = admin ? BOOTSTRAP_ADMIN_PROVIDER : 'email';
    const user = await upsertEmailUser({ email, password, provider });
    await audit(req, 'internal_register', user.id, { email: user.email, provider: user.provider });
    return res.json({ ok: true, user: { id: user.id, email: user.email, provider: user.provider } });
  });

  router.get('/auth/redirect/start', (req, res) => {
    const returnTo = safeReturnTo(req.query?.returnTo);
    if (!returnTo) return res.status(400).json({ ok: false, error: 'invalid_return_to' });
    res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  });

  router.post('/auth/redirect/complete', authLimiter, async (req, res) => {
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

  router.post('/auth/redirect/exchange', authLimiter, async (req, res) => {
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

  router.post('/auth/refresh', authLimiter, async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ ok: false, error: 'refresh_required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
        issuer: 'dashdesign-login-service',
        audience: 'dashdesign-apps',
      });
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

  router.get('/auth/google/start', (req, res) => {
    if (!GOOGLE_CONFIGURED) return res.status(503).json({ ok: false, error: 'google_not_configured' });
    return res.json({ ok: true, message: 'Google start ready. OAuth redirect wiring next.', returnTo: req.query?.returnTo || null });
  });

  router.get('/auth/google/callback', (_req, res) => {
    res.json({ ok: true, mode: 'stub', message: 'Google callback scaffold endpoint.' });
  });

  router.get('/auth/apple/start', (req, res) => {
    if (!APPLE_CONFIGURED) return res.status(503).json({ ok: false, error: 'apple_not_configured' });
    return res.json({ ok: true, message: 'Apple start ready. OAuth redirect wiring next.', returnTo: req.query?.returnTo || null });
  });

  router.get('/auth/apple/callback', (_req, res) => {
    res.json({ ok: true, mode: 'stub', message: 'Apple callback scaffold endpoint.' });
  });

  router.get('/auth/me', authLimiter, async (req, res) => {
    const claims = readAccessClaims(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'auth_invalid' });

    const userQ = await pool.query('SELECT id, email, provider FROM users WHERE id = $1', [claims.sub]);
    if (userQ.rowCount === 0) return res.status(404).json({ ok: false, error: 'user_not_found' });
    const user = userQ.rows[0];
    const roles = resolveRoles(user.email, user.provider);

    return res.json({ ok: true, user: { id: user.id, email: user.email, provider: user.provider, roles }, claims: { ...claims, roles } });
  });

  router.get('/auth/session', authLimiter, async (req, res) => {
    const claims = readAccessClaims(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'auth_invalid' });
    return res.json({ ok: true, claims });
  });

  router.post('/onboarding/profile', authLimiter, async (req, res) => {
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

    await audit(req, 'onboarding_update', userId, {
      hasHometown: !!rows[0]?.hometown,
      hasBirthdate: !!rows[0]?.birthdate,
      agbAccepted: !!rows[0]?.agbAccepted,
    });

    return res.json({ ok: true, message: 'Onboarding profile saved.', profile: rows[0] });
  });

  router.post('/analytics/event', authLimiter, async (req, res) => {
    const { userId = null, eventType, payload = {} } = req.body || {};
    if (!eventType) return res.status(400).json({ ok: false, error: 'event_type_required' });

    await pool.query(
      'INSERT INTO analytics_events (user_id, event_type, payload) VALUES ($1, $2, $3::jsonb)',
      [userId, eventType, JSON.stringify(payload)]
    );

    return res.json({ ok: true });
  });

  return router;
}
