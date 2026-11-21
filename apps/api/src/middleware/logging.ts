import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import pino, { type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from '../config.js';

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.nodeEnv === 'test' ? 'silent' : config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
        'token',
        '*.token',
      ],
      censor: '[redacted]',
    },
  });
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function loggingMiddleware(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => String((res as unknown as Response).locals.requestId),
    autoLogging: {
      ignore: (req) => req.url === '/health/liveness',
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    customProps: (req) => ({
      actorRole: (req as Request).auth?.role ?? 'anonymous',
    }),
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
