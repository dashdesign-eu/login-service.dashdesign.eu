import { REDIRECT_ALLOWED_ORIGINS } from '../config/env.js';

export function safeReturnTo(input) {
  if (!input) return null;
  try {
    const url = new URL(String(input));
    const hostname = url.hostname;
    const isLocalhost = ['localhost', '127.0.0.1'].includes(hostname);

    if (!REDIRECT_ALLOWED_ORIGINS.length) {
      if (url.protocol !== 'https:' && !isLocalhost) return null;
      return url.toString();
    }

    const allowed = new Set(REDIRECT_ALLOWED_ORIGINS);
    if (isLocalhost) return url.toString();
    if (allowed.has(url.origin) || allowed.has(hostname) || allowed.has(url.host) || allowed.has(url.toString())) return url.toString();
    return null;
  } catch {
    return null;
  }
}
