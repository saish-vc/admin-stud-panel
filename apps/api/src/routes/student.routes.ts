import type { Router } from 'express';
import { Router as createRouter } from 'express';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { errors, parseOrThrow } from '../lib/errors.js';
import { documentObjectKey, type StorageAdapter } from '../lib/storage.js';
import {
  requestIdParamsSchema,
  createRequestSchema,
  requestQuerySchema,
} from '../lib/validation.js';
import {
  requireAuth,
  requirePasswordChanged,
  requireRoles,
  requireStudentId,
} from '../auth/middleware.js';
import { uploadRateLimiter } from '../middleware/rate-limit.js';
import { documentUpload, prepareDocument, sendDownload } from '../middleware/upload.js';
import { StudentService } from '../services/student.service.js';

const resubmitSchema = createRequestSchema.pick({ purpose: true });

export function createStudentRouter(db: AppDb, config: AppConfig, storage: StorageAdapter): Router {
  const router = createRouter();
  const service = new StudentService(db);

  router.use(requireAuth(db, config), requirePasswordChanged, requireRoles('STUDENT'));

  router.get('/profile', async (req, res) => {
    const studentId = requireStudentId(req);
    res.json({ data: await service.profile(studentId) });
  });

  router.get('/requests', async (req, res) => {
    const studentId = requireStudentId(req);
    const query = parseOrThrow(requestQuerySchema, req.query);
    res.json({ data: await service.listRequests(studentId, query.page, query.limit) });
  });

  router.post('/requests', uploadRateLimiter(config), documentUpload(config), async (req, res) => {
    const studentId = requireStudentId(req);
    const input = parseOrThrow(createRequestSchema, req.body);
    const document = prepareDocument(req);
    let documentKey: string | undefined;
    if (document) {
      documentKey = documentObjectKey(document.extension);
      await storage.put(documentKey, document.buffer, document.contentType);
    }

    try {
      const requestId = await service.createRequest(studentId, {
        certificateType: input.certificateType,
        purpose: input.purpose,
        ...(documentKey ? { documentKey } : {}),
      });
      res.status(201).json({ data: await service.getRequest(studentId, requestId) });
    } catch (error) {
      if (documentKey) await storage.delete(documentKey).catch(() => undefined);
      throw error;
    }
  });

  router.get('/requests/:requestId', async (req, res) => {
    const studentId = requireStudentId(req);
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    res.json({ data: await service.getRequest(studentId, requestId) });
  });

  router.post(
    '/requests/:requestId/resubmit',
    uploadRateLimiter(config),
    documentUpload(config),
    async (req, res) => {
      const studentId = requireStudentId(req);
      const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
      const input = parseOrThrow(resubmitSchema, req.body);
      const document = prepareDocument(req);
      let documentKey: string | undefined;
      if (document) {
        documentKey = documentObjectKey(document.extension);
        await storage.put(documentKey, document.buffer, document.contentType);
      }

      try {
        await service.resubmit(studentId, requestId, {
          purpose: input.purpose,
          ...(documentKey ? { documentKey } : {}),
        });
        res.json({ data: await service.getRequest(studentId, requestId) });
      } catch (error) {
        if (documentKey) await storage.delete(documentKey).catch(() => undefined);
        throw error;
      }
    },
  );

  router.get('/requests/:requestId/document', async (req, res) => {
    const studentId = requireStudentId(req);
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    const doc = await service.getDocumentObject(studentId, requestId);
    const buffer = await storage.get(doc.key);
    const ext = doc.key.split('.').pop() ?? 'bin';
    const contentType =
      ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
    sendDownload(res, buffer, contentType, `${doc.rollNumber}-supporting-document.${ext}`);
  });

  router.get('/requests/:requestId/certificate', async (req, res) => {
    const studentId = requireStudentId(req);
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    const cert = await service.getCertificateObject(studentId, requestId);
    const buffer = await storage.get(cert.key);
    sendDownload(res, buffer, 'application/pdf', `${cert.rollNumber}-certificate.pdf`);
  });

  router.get('/requests/:requestId/verification', async (req, res) => {
    const studentId = requireStudentId(req);
    const { requestId } = parseOrThrow(requestIdParamsSchema, req.params);
    res.json({ data: await service.getVerification(studentId, requestId) });
  });

  router.use((_req, _res, next) => {
    next(errors.notFound());
  });

  return router;
}
