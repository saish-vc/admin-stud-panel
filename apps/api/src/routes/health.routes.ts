import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { AppDb } from '../db/client.js';

export function createHealthRouter(db: AppDb): Router {
  const router = Router();

  router.get('/liveness', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      service: 'nttf-certificate-portal',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/readiness', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ status: 'ready', database: 'ok' });
    } catch {
      res.status(503).setHeader('Cache-Control', 'no-store');
      res.json({ status: 'unavailable', database: 'unavailable' });
    }
  });

  return router;
}
