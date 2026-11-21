import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import type { DbExecutor } from '../db/client.js';
import type { PrincipalRole } from '../db/schema.js';
import { AppError, errors } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { loadPrincipal } from './principal.js';

function bearerToken(req: Request): string {
  const header = req.header('authorization');
  if (!header) throw errors.unauthorized();
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw errors.unauthorized('A valid bearer token is required.');
  }
  return token;
}

export function requireAuth(db: DbExecutor, config: AppConfig): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req);
      let payload;
      try {
        payload = verifyAccessToken(token, config.jwtSecret);
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'TokenExpiredError') {
          throw errors.unauthorized('Access token expired.', 'TOKEN_EXPIRED');
        }
        throw errors.unauthorized('Access token is invalid.', 'INVALID_TOKEN');
      }
      req.auth = await loadPrincipal(db, payload);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.mustChangePassword) {
    next(
      new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'You must change your temporary password before continuing.',
      ),
    );
    return;
  }
  next();
}

export function requireRoles(...roles: PrincipalRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) throw errors.unauthorized();
      if (!roles.includes(req.auth.role)) {
        throw errors.forbidden('Your role cannot perform this action.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireStudentId(req: Request): string {
  if (!req.auth || req.auth.role !== 'STUDENT') {
    throw errors.forbidden('A student account is required.');
  }
  return req.auth.id;
}

export function requireAdminId(req: Request): string {
  if (!req.auth || req.auth.role === 'STUDENT') {
    throw errors.forbidden('A staff account is required.');
  }
  return req.auth.id;
}
