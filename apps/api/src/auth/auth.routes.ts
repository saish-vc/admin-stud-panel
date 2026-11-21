import { Router, type Request, type Response } from 'express';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { errors, parseOrThrow } from '../lib/errors.js';
import {
  changePasswordSchema,
  loginAdminSchema,
  loginStudentSchema,
  normalizeRollNumber,
} from '../lib/validation.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { AuthService } from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.js';
import { requireAuth } from './middleware.js';
import type { AuthTokens, LoginMeta, Principal } from './types.js';

function loginMeta(req: Request): LoginMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

function principalUser(auth: Principal) {
  return {
    id: auth.id,
    role: auth.role,
    name: auth.name,
    email: auth.email,
    mustChangePassword: auth.mustChangePassword,
    ...(auth.rollNumber ? { rollNumber: auth.rollNumber } : {}),
    ...(auth.programme ? { programme: auth.programme } : {}),
  };
}

function respondWithTokens(
  res: Response,
  config: AppConfig,
  tokens: AuthTokens,
  status = 200,
): void {
  setRefreshCookie(res, config, tokens.refreshToken);
  res.status(status).json({
    data: {
      accessToken: tokens.accessToken,
      user: tokens.user,
    },
  });
}

export function createAuthRouter(db: AppDb, config: AppConfig): Router {
  const router = Router();
  const authService = new AuthService(db, config);
  const authenticate = requireAuth(db, config);
  const limiter = authRateLimiter(config);

  router.post('/student/login', limiter, async (req, res) => {
    const input = parseOrThrow(loginStudentSchema, req.body);
    const tokens = await authService.loginStudent(
      normalizeRollNumber(input.rollNumber),
      input.password,
      loginMeta(req),
    );
    respondWithTokens(res, config, tokens);
  });

  router.post('/admin/login', limiter, async (req, res) => {
    const input = parseOrThrow(loginAdminSchema, req.body);
    const tokens = await authService.loginAdmin(input.email, input.password, loginMeta(req));
    respondWithTokens(res, config, tokens);
  });

  router.post('/refresh', limiter, async (req, res) => {
    const token = readRefreshCookie(req, config);
    if (!token) throw errors.unauthorized('No refresh session was provided.', 'INVALID_SESSION');
    const tokens = await authService.refresh(token, loginMeta(req));
    respondWithTokens(res, config, tokens);
  });

  router.post('/logout', async (req, res) => {
    const token = readRefreshCookie(req, config);
    await authService.logout(token);
    clearRefreshCookie(res, config);
    res.status(204).end();
  });

  router.get('/me', authenticate, (req, res) => {
    if (!req.auth) throw errors.unauthorized();
    res.json({ data: { user: principalUser(req.auth) } });
  });

  router.post('/change-password', limiter, authenticate, async (req, res) => {
    if (!req.auth) throw errors.unauthorized();
    const input = parseOrThrow(changePasswordSchema, req.body);
    const tokens = await authService.changePassword(
      { id: req.auth.id, role: req.auth.role, name: req.auth.name, email: req.auth.email },
      input.currentPassword,
      input.newPassword,
      loginMeta(req),
    );
    respondWithTokens(res, config, tokens);
  });

  return router;
}
