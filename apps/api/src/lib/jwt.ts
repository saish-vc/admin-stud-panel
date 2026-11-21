import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import type { PrincipalRole } from '../db/schema.js';

export const JWT_ISSUER = 'nttf-portal';
export const JWT_AUDIENCE = 'nttf-web';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: PrincipalRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  role: PrincipalRole;
  type: 'refresh';
}

const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  role: z.enum(['STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN']),
  type: z.literal('access'),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

const refreshClaimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  role: z.enum(['STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN']),
  type: z.literal('refresh'),
  jti: z.string().uuid(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export function signAccessToken(payload: AccessTokenPayload, secret: string, ttl: string): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: ttl as SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: RefreshTokenPayload & { jti: string },
  secret: string,
  ttlDays: number,
): string {
  const { jti, ...claims } = payload;
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: `${ttlDays}d`,
    jwtid: jti,
  });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return accessClaimsSchema.parse(decoded);
}

export function verifyRefreshToken(
  token: string,
  secret: string,
): RefreshTokenPayload & { jti: string } {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return refreshClaimsSchema.parse(decoded);
}
