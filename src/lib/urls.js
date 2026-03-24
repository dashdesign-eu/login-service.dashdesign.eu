import { REDIRECT_ALLOWED_ORIGINS, ALLOW_INSECURE_REDIRECTS } from '../config/env.js';

export function safeReturnTo(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname;
    const isLocalhost = ['localhost', '127.0.0.1'].includes(hostname);
    if (!ALLOW_INSECURE_REDIRECTS && !isLocalhost && url.protocol !== 'https:') {
      return null;
    }

    if (!REDIRECT_ALLOWED_ORIGINS.length) {
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
