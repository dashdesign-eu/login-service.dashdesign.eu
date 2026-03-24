import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { CORS_ALLOWLIST } from './config/env.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createPublicRouter } from './routes/publicRoutes.js';

export function createApp() {
  const app = express();

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

  app.use(createPublicRouter());
  app.use(createAuthRouter());

  return app;
}
