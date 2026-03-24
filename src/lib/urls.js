import { REDIRECT_ALLOWED_ORIGINS } from '../config/env.js';

export function safeReturnTo(input) {
  if (!input) return null;
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    if (!REDIRECT_ALLOWED_ORIGINS.length) return url.toString();
    return REDIRECT_ALLOWED_ORIGINS.includes(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}
