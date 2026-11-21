import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/lib/jwt.js';

const ACCESS_SECRET = 'unit-access-secret-0123456789abcdefghij';
const REFRESH_SECRET = 'unit-refresh-secret-0123456789abcdefgh';

const subject = randomUUID();
const sessionId = randomUUID();

describe('JWT helpers', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken(
      { sub: subject, sid: sessionId, role: 'HOD', type: 'access' },
      ACCESS_SECRET,
      '15m',
    );
    const payload = verifyAccessToken(token, ACCESS_SECRET);
    expect(payload).toMatchObject({
      sub: subject,
      sid: sessionId,
      role: 'HOD',
      type: 'access',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    });
  });

  it('signs and verifies a refresh token with its JTI', () => {
    const jti = randomUUID();
    const token = signRefreshToken(
      {
        sub: subject,
        sid: sessionId,
        role: 'STUDENT',
        type: 'refresh',
        jti,
      },
      REFRESH_SECRET,
      7,
    );
    expect(verifyRefreshToken(token, REFRESH_SECRET)).toMatchObject({
      sub: subject,
      sid: sessionId,
      role: 'STUDENT',
      type: 'refresh',
      jti,
    });
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = signAccessToken(
      { sub: subject, sid: sessionId, role: 'CLERK', type: 'access' },
      ACCESS_SECRET,
      '15m',
    );
    expect(() => verifyAccessToken(token, REFRESH_SECRET)).toThrow();
  });

  it('rejects an expired access token', () => {
    const token = signAccessToken(
      { sub: subject, sid: sessionId, role: 'CLERK', type: 'access' },
      ACCESS_SECRET,
      '-1s',
    );
    expect(() => verifyAccessToken(token, ACCESS_SECRET)).toThrowError(
      expect.objectContaining({ name: 'TokenExpiredError' }),
    );
  });

  it('refuses to treat an access token as a refresh token', () => {
    const token = signAccessToken(
      { sub: subject, sid: sessionId, role: 'CLERK', type: 'access' },
      ACCESS_SECRET,
      '15m',
    );
    expect(() => verifyRefreshToken(token, ACCESS_SECRET)).toThrow();
  });

  it('rejects a tampered payload', () => {
    const token = signAccessToken(
      { sub: subject, sid: sessionId, role: 'STUDENT', type: 'access' },
      ACCESS_SECRET,
      '15m',
    );
    const [header, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
      role: string;
    };
    decoded.role = 'SUPER_ADMIN';
    const forged = `${header}.${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`;
    expect(() => verifyAccessToken(forged, ACCESS_SECRET)).toThrow();
  });
});
