import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const xff = req.get('x-forwarded-for');
    const forwarded = xff ? String(xff).split(',')[0].trim() : '';
    return req.ip || forwarded || req.socket?.remoteAddress || 'unknown';
  },
  validate: {
    xForwardedForHeader: false,
  },
  handler: (_req, res) => {
    return res.status(429).json({ ok: false, error: 'too_many_requests' });
  },
});
