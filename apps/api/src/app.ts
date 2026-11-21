import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { createAuthRouter } from './auth/auth.routes.js';
import type { AppConfig } from './config.js';
import type { AppDb } from './db/client.js';
import { errors, errorMiddleware } from './lib/errors.js';
import { createStorage, type StorageAdapter } from './lib/storage.js';
import { corsMiddleware } from './middleware/cors.js';
import { createLogger, loggingMiddleware, requestIdMiddleware } from './middleware/logging.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createDocsRouter } from './routes/docs.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createStudentRouter } from './routes/student.routes.js';
import type { PdfGenerator } from './services/admin.service.js';

export interface AppOptions {
  db: AppDb;
  config: AppConfig;
  storage?: StorageAdapter;
  logger?: Logger;
  generatePdf?: PdfGenerator;
}

export function createApp(options: AppOptions): Express {
  const { db, config } = options;
  const logger = options.logger ?? createLogger(config);
  const storage = options.storage ?? createStorage(config);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(requestIdMiddleware);
  app.use(loggingMiddleware(logger));
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(corsMiddleware(config));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/health', createHealthRouter(db));
  app.use('/api/auth', createAuthRouter(db, config));
  app.use('/api', createPublicRouter(db));
  app.use('/api/student', createStudentRouter(db, config, storage));
  app.use('/api/admin', createAdminRouter(db, config, storage, logger, options.generatePdf));

  const docsRouter = createDocsRouter(config);
  if (docsRouter) app.use('/api/docs', docsRouter);

  app.use((_req, _res, next) => next(errors.notFound()));
  app.use(errorMiddleware);

  return app;
}
