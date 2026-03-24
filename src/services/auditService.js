import { pool } from '../db.js';

export async function audit(req, action, userId = null, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, action, req?.ip || null, req?.get?.('user-agent') || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[audit] write failed', err?.message || err);
  }
}
