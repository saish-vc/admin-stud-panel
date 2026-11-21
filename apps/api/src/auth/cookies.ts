import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../config.js';

export function refreshCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: config.cookie.refreshPath,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(config.cookie.name, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  const options = refreshCookieOptions(config);
  delete options.maxAge;
  res.clearCookie(config.cookie.name, options);
}

export function readRefreshCookie(req: Request, config: AppConfig): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[config.cookie.name];
  return typeof value === 'string' ? value : undefined;
}
