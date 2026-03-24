import bcrypt from 'bcryptjs';

import { pool } from '../db.js';
import { audit } from './auditService.js';
import {
  BOOTSTRAP_ADMIN_NAME_LENGTH,
  BOOTSTRAP_ADMIN_PASSWORD_LENGTH,
  BOOTSTRAP_ADMIN_PREFIX,
  BOOTSTRAP_ADMIN_PROVIDER,
} from '../config/env.js';
import { randomAlphaNumeric } from '../lib/crypto.js';

export async function upsertEmailUser({ email, password, provider = 'email' }) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized || !password || password.length < 8) {
    throw new Error('invalid_input');
  }

  const userId = `email:${normalized}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (id, email, provider, last_login_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         provider = CASE WHEN users.provider = 'bootstrap_admin' THEN users.provider ELSE EXCLUDED.provider END,
         last_login_at = NOW()`,
    [userId, normalized, provider]
  );

  await pool.query(
    `INSERT INTO auth_credentials (user_id, password_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [userId, passwordHash]
  );

  return { id: userId, email: normalized, provider };
}

export async function ensureBootstrapAdmin() {
  const users = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (Number(users.rows[0]?.count || 0) > 0) {
    console.log('[bootstrap-admin] users exist, skipping initial admin seeding');
    return;
  }

  const suffix = randomAlphaNumeric(Math.max(1, BOOTSTRAP_ADMIN_NAME_LENGTH), 'abcdefghijklmnopqrstuvwxyz0123456789');
  const email = `${BOOTSTRAP_ADMIN_PREFIX}${suffix}`;
  const password = randomAlphaNumeric(
    Math.max(12, BOOTSTRAP_ADMIN_PASSWORD_LENGTH),
    'abcdefghijkmnpqrstuvwxyzABCDEFGHIJKLMNPQRSTUVWXYZ23456789!@#$%&*'
  );

  const user = await upsertEmailUser({ email, password, provider: BOOTSTRAP_ADMIN_PROVIDER });
  await audit(null, 'bootstrap_admin_created', user.id, { email: user.email, provider: user.provider });

  console.log('[bootstrap-admin] Created initial admin user.');
  console.log(`[bootstrap-admin] ${email} PW: ${password}`);
}
