import { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { errors, parseOrThrow } from '../lib/errors.js';
import type { StorageAdapter } from '../lib/storage.js';
import {
  adminRequestQuerySchema,
  decisionRequestSchema,
  rejectRequestSchema,
  requestIdParamsSchema,
  verifyRequestSchema,
} from '../lib/validation.js';
import {
  requireAdminId,
  requireAuth,
  requirePasswordChanged,
  requireRoles,
} from '../auth/middleware.js';
import type { PdfGenerator } from '../services/admin.service.js';
import { AdminService } from '../services/admin.service.js';
import { sendDownload } from '../middleware/upload.js';
import type { Logger } from 'pino';

export function createAdminRouter(
  db: AppDb,
  config: AppConfig,
  storage: StorageAdapter,
  logger: Logger,
  generatePdf?: PdfGenerator,
): Router {
  const router = Router();
  const service = new AdminService({
    db,
    config,
    storage,
    logger,
    ...(generatePdf ? { generatePdf } : {}),
  });

  router.use(
    requireAuth(db, config),
    requirePasswordChanged,
    requireRoles('CLERK', 'HOD', 'SUPER_ADMIN'),
  );

  router.get('/stats', async (_req, res) => {
    res.json({ data: await service.getStats() });
  });

  router.get('/requests', async (req, res) => {
    const query = parseOrThrow(adminRequestQuerySchema, req.query);
    res.json({
      data: await service.listRequests({
        status: query.status,
        type: query.type,
        q: query.q,
        page: query.page,
        limit: query.limit,
      }),
    });
  });

  router.get('/requests/:requestId', async (req, res) => {
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    res.json({ data: await service.getRequest(requestId) });
  });

  router.post(
    '/requests/:requestId/verify',
    requireRoles('CLERK', 'SUPER_ADMIN'),
    async (req, res) => {
      const adminId = requireAdminId(req);
      if (!req.auth || req.auth.role === 'STUDENT') throw errors.forbidden();
      if (req.auth.role !== 'CLERK' && req.auth.role !== 'SUPER_ADMIN') {
        throw errors.forbidden('Only a clerk or super administrator can verify documents.');
      }
      const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
      const input = parseOrThrow(verifyRequestSchema, req.body ?? {});
      res.json({
        data: await service.verify(requestId, adminId, req.auth.role, input.remarks),
      });
    },
  );

  router.post(
    '/requests/:requestId/approve',
    requireRoles('HOD', 'SUPER_ADMIN'),
    async (req, res) => {
      const adminId = requireAdminId(req);
      if (!req.auth || (req.auth.role !== 'HOD' && req.auth.role !== 'SUPER_ADMIN')) {
        throw errors.forbidden();
      }
      const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
      const input = parseOrThrow(decisionRequestSchema, req.body ?? {});
      const result = await service.approve(requestId, adminId, req.auth.role, input.remarks);
      res.json({
        data: {
          request: result.request,
          ...(result.issuance.ok
            ? { generationWarning: null }
            : { generationWarning: result.issuance.reason }),
        },
      });
    },
  );

  router.post(
    '/requests/:requestId/reject',
    requireRoles('HOD', 'SUPER_ADMIN'),
    async (req, res) => {
      const adminId = requireAdminId(req);
      if (!req.auth || (req.auth.role !== 'HOD' && req.auth.role !== 'SUPER_ADMIN')) {
        throw errors.forbidden();
      }
      const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
      const input = parseOrThrow(rejectRequestSchema, req.body ?? {});
      res.json({
        data: await service.reject(requestId, adminId, req.auth.role, input.remarks),
      });
    },
  );

  router.post(
    '/requests/:requestId/generate',
    requireRoles('HOD', 'SUPER_ADMIN'),
    async (req, res) => {
      const adminId = requireAdminId(req);
      if (!req.auth || (req.auth.role !== 'HOD' && req.auth.role !== 'SUPER_ADMIN')) {
        throw errors.forbidden();
      }
      const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
      const result = await service.generate(requestId, adminId, req.auth.role);
      res.json({
        data: {
          request: result.request,
          ...(result.issuance.ok
            ? { generationWarning: null }
            : { generationWarning: result.issuance.reason }),
        },
      });
    },
  );

  router.get('/requests/:requestId/document', async (req, res) => {
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    const doc = await service.getDocumentObject(requestId);
    const buffer = await storage.get(doc.key);
    const ext = doc.key.split('.').pop() ?? 'bin';
    const contentType =
      ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
    sendDownload(res, buffer, contentType, `${doc.rollNumber}-supporting-document.${ext}`);
  });

  router.get('/requests/:requestId/certificate', async (req, res) => {
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    const cert = await service.getCertificateObject(requestId);
    const buffer = await storage.get(cert.key);
    sendDownload(res, buffer, 'application/pdf', `${cert.rollNumber}-certificate.pdf`);
  });

  router.use((_req, _res, next) => {
    next(errors.notFound());
  });

  return router;
}
