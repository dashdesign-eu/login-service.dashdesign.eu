import express from 'express';

import { pool } from '../db.js';
import { safeReturnTo } from '../lib/urls.js';
import { renderAccountHtml, renderPortalHtml } from '../views/authViews.js';

export function createPublicRouter() {
  const router = express.Router();

  router.get('/', (_req, res) => {
    return res.redirect('/login');
  });

  router.get('/login', (req, res) => {
    const requestedReturnTo = req.query?.returnTo || req.query?.return_to || req.query?.next;
    const returnTo = safeReturnTo(requestedReturnTo);
    if (requestedReturnTo && !returnTo) return res.status(400).send('invalid_return_to');
    res.type('html').send(renderPortalHtml({ returnTo: returnTo || '' }));
  });

  router.get('/account', (_req, res) => {
    res.type('html').send(renderAccountHtml());
  });

  router.get('/health', async (_req, res) => {
    const db = await pool.query('SELECT NOW() as now');
    res.json({ ok: true, service: 'dashdesign-login-service', ts: new Date().toISOString(), dbNow: db.rows[0].now });
  });

  router.get('/ui/login-button-template', (_req, res) => {
    res.type('application/json').send({
      html: 'Mit <span style="font-weight:800;color:#0585ff;">dashdesign;</span> anmelden.',
    });
  });

  return router;
}
