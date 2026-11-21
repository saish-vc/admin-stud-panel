import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';

export function createDocsRouter(config: AppConfig): Router | null {
  if (!config.enableDocs) return null;

  const router = Router();
  if (!existsSync(config.openApiPath)) {
    router.get('/', (_req, res) => {
      res.status(503).json({
        error: {
          code: 'DOCS_UNAVAILABLE',
          message: 'OpenAPI document is not installed on this instance.',
        },
      });
    });
    return router;
  }

  const document = YAML.parse(readFileSync(config.openApiPath, 'utf8')) as Record<string, unknown>;
  if (!document || typeof document !== 'object' || !document.openapi) {
    throw new AppError(500, 'INVALID_OPENAPI', 'OpenAPI document is invalid.');
  }

  router.use('/', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'NTTF API' }));
  return router;
}
