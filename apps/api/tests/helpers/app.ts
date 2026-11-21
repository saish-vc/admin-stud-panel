import pino from 'pino';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';
import type { AppDb } from '../../src/db/client.js';
import type { PdfGenerator } from '../../src/services/admin.service.js';
import { createTestConfig } from './config.js';
import { MemoryStorage } from './storage.js';

export interface TestApplication {
  app: Express;
  config: AppConfig;
  storage: MemoryStorage;
  logger: pino.Logger;
}

export function createTestApp(
  db: AppDb,
  options: {
    config?: AppConfig;
    storage?: MemoryStorage;
    generatePdf?: PdfGenerator;
  } = {},
): TestApplication {
  const config = options.config ?? createTestConfig();
  const storage = options.storage ?? new MemoryStorage();
  const logger = pino({ level: 'silent' });
  const app = createApp({
    db,
    config,
    storage,
    logger,
    ...(options.generatePdf ? { generatePdf: options.generatePdf } : {}),
  });
  return { app, config, storage, logger };
}
