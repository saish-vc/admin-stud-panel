import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  code?: string;
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(429, options.code ?? 'RATE_LIMITED', options.message ?? 'Too many requests.'),
      );
    },
  });
}

export function authRateLimiter(config: AppConfig): RequestHandler {
  return createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.authRateLimitMax,
    code: 'RATE_LIMITED',
    message: 'Too many authentication attempts. Please wait before trying again.',
  });
}

export function uploadRateLimiter(_config: AppConfig): RequestHandler {
  return createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many uploads. Please wait before trying again.',
  });
}

export function publicRateLimiter(): RequestHandler {
  return createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many verification attempts. Please wait before trying again.',
  });
}
