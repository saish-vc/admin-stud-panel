import cors from 'cors';
import type { CorsOptions } from 'cors';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';

export function corsMiddleware(config: AppConfig) {
  const options: CorsOptions = {
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
    origin(origin, callback) {
      // Same-origin/curl requests may omit Origin. Browsers send it for cross-origin calls.
      if (!origin || config.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed.'));
    },
  };
  return cors(options);
}
