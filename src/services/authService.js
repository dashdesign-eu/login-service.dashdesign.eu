import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import { pool } from '../db.js';
import {
  ACCESS_TTL_SECONDS,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  REDIRECT_TOKEN_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from '../config/env.js';
import { resolveRoles } from '../lib/roles.js';
import { sha256 } from '../lib/crypto.js';

export function readAccessClaims(req) {
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

export function issueTokens(user) {
  const roles = resolveRoles(user.email, user.provider);
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, provider: user.provider, roles },
    JWT_ACCESS_SECRET,
    {
      expiresIn: ACCESS_TTL_SECONDS,
      issuer: 'dashdesign-login-service',
      audience: 'dashdesign-apps',
    }
  );

  const refreshToken = jwt.sign({ sub: user.id, kind: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_SECONDS,
    issuer: 'dashdesign-login-service',
    audience: 'dashdesign-apps',
  });

  return { accessToken, refreshToken, roles: resolveRoles(user.email, user.provider) };
}

export async function saveRefreshToken(userId, refreshToken) {
  const tokenHash = sha256(refreshToken);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)`,
    [userId, tokenHash, String(REFRESH_TTL_SECONDS)]
  );
}

export async function issueRedirectCallbackToken(userId, returnTo) {
  const callbackToken = crypto.randomBytes(32).toString('hex');
  const callbackTokenHash = sha256(callbackToken);

  await pool.query(
    `INSERT INTO auth_redirect_tokens (user_id, callback_token_hash, return_to, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
    [userId, callbackTokenHash, returnTo, String(REDIRECT_TOKEN_TTL_SECONDS)]
  );

  return callbackToken;
}

export async function performPasswordLogin(username, password) {
  const normalized = String(username).toLowerCase().trim();
  const userIds = [`email:${normalized}`, `username:${normalized}`];

  const q = await pool.query(
    `SELECT u.id, u.email, u.provider, c.password_hash
     FROM users u
     LEFT JOIN auth_credentials c ON c.user_id = u.id
     WHERE u.id = ANY($1::text[]) OR LOWER(u.email) = $2`,
    [userIds, normalized]
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
