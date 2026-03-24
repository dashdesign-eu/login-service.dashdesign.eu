import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { CORS_ALLOWLIST, TRUST_PROXY } from './config/env.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createPublicRouter } from './routes/publicRoutes.js';

export function createApp() {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  app.set('trust proxy', TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || CORS_ALLOWLIST.includes(origin)) return cb(null, true);
        return cb(new Error('CORS blocked'));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '200kb' }));
  app.use('/static', express.static(path.join(__dirname, 'public')));

  app.use(createPublicRouter());
  app.use(createAuthRouter());
  app.use((err, _req, res, _next) => {
    const message = String(err?.message || '');
    if (message === 'CORS blocked') return res.status(403).json({ ok: false, error: 'cors_blocked' });
    console.error('[app-error]', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}
