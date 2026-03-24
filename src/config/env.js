import { randomUUID } from 'crypto';

const toPositiveNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const splitList = (value = '') =>
  String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const parseRoleList = (name) => splitList(process.env[name]);

export const BOOTSTRAP_ADMIN_PROVIDER = 'bootstrap_admin';

export const config = Object.freeze({
  PORT: Number(process.env.PORT || 8080),
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:8080',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || `change-me-access-${randomUUID()}`,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || `change-me-refresh-${randomUUID()}`,
  ACCESS_TTL_SECONDS: toPositiveNumber(process.env.ACCESS_TTL_SECONDS, 900),
  REFRESH_TTL_SECONDS: toPositiveNumber(process.env.REFRESH_TTL_SECONDS, 2592000),
  OTP_TTL_MINUTES: toPositiveNumber(process.env.OTP_TTL_MINUTES, 10),
  REDIRECT_TOKEN_TTL_SECONDS: toPositiveNumber(process.env.REDIRECT_TOKEN_TTL_SECONDS, 120),
  REDIRECT_ALLOWED_ORIGINS: splitList(process.env.REDIRECT_ALLOWED_ORIGINS),
  HIDDEN_REGISTRATION_SECRET: process.env.HIDDEN_REGISTRATION_SECRET || '',
  BOOTSTRAP_ADMIN_PREFIX: process.env.BOOTSTRAP_ADMIN_PREFIX || 'admin-',
  BOOTSTRAP_ADMIN_NAME_LENGTH: toPositiveNumber(process.env.BOOTSTRAP_ADMIN_NAME_LENGTH || 8, 8),
  BOOTSTRAP_ADMIN_PASSWORD_LENGTH: toPositiveNumber(process.env.BOOTSTRAP_ADMIN_PASSWORD_LENGTH || 16, 16),
  CORS_ALLOWLIST: splitList(process.env.CORS_ALLOWLIST || process.env.APP_BASE_URL || 'http://localhost:8080'),
  MONITOR_ADMIN_EMAILS: parseRoleList('MONITOR_ADMIN_EMAILS'),
  MONITOR_EDITOR_EMAILS: parseRoleList('MONITOR_EDITOR_EMAILS'),
  MONITOR_VIEWER_EMAILS: parseRoleList('MONITOR_VIEWER_EMAILS'),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID || '',
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID || '',
  APPLE_KEY_ID: process.env.APPLE_KEY_ID || '',
  APPLE_PRIVATE_KEY_PATH: process.env.APPLE_PRIVATE_KEY_PATH || './secrets/AuthKey.p8',
  APPLE_REDIRECT_URI: process.env.APPLE_REDIRECT_URI || '',
  GOOGLE_CONFIGURED: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  APPLE_CONFIGURED: !!(process.env.APPLE_TEAM_ID && process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID),
});

export const {
  APPLE_CLIENT_ID,
  APPLE_CONFIGURED,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY_PATH,
  APPLE_REDIRECT_URI,
  APPLE_TEAM_ID,
  APP_BASE_URL,
  ACCESS_TTL_SECONDS,
  BOOTSTRAP_ADMIN_NAME_LENGTH,
  BOOTSTRAP_ADMIN_PASSWORD_LENGTH,
  BOOTSTRAP_ADMIN_PREFIX,
  CORS_ALLOWLIST,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_CONFIGURED,
  HIDDEN_REGISTRATION_SECRET,
  MONITOR_ADMIN_EMAILS,
  MONITOR_EDITOR_EMAILS,
  MONITOR_VIEWER_EMAILS,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  PORT,
  REDIRECT_ALLOWED_ORIGINS,
  REDIRECT_TOKEN_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} = config;
