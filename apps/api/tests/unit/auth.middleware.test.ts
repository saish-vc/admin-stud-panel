import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  requireAdminId,
  requireAuth,
  requirePasswordChanged,
  requireRoles,
  requireStudentId,
} from '../../src/auth/middleware.js';
import type { DbExecutor } from '../../src/db/client.js';
import type { PrincipalRole } from '../../src/db/schema.js';
import { AppError } from '../../src/lib/errors.js';
import { signAccessToken } from '../../src/lib/jwt.js';
import { createTestConfig } from '../helpers/config.js';

const config = createTestConfig();

const studentRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ananya Menon',
  email: 'ananya@students.nttf.ac.in',
  rollNumber: 'NTTF2026001',
  programme: 'Diploma in Computer Engineering',
  status: 'ACTIVE',
  mustChangePassword: false,
};

const adminRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Head of Department',
  email: 'hod@nttf.ac.in',
  role: 'HOD',
  isActive: true,
  mustChangePassword: false,
};

/** Minimal chainable stand-in for the drizzle query used by loadPrincipal. */
function principalDb(rows: unknown[]): DbExecutor {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return { select: () => chain } as unknown as DbExecutor;
}

function requestWith(authorization?: string): Request {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as unknown as Request;
}

const response = {} as Response;

function run(handler: ReturnType<typeof requireAuth>, req: Request): Promise<unknown> {
  return new Promise((resolve) => {
    const next = vi.fn((error?: unknown) => resolve(error));
    void handler(req, response, next as NextFunction);
  });
}

function accessTokenFor(role: PrincipalRole, ttl = '15m'): string {
  return signAccessToken(
    { sub: studentRow.id, sid: '33333333-3333-4333-8333-333333333333', role, type: 'access' },
    config.jwtSecret,
    ttl,
  );
}

describe('requireAuth', () => {
  it('accepts a valid token and attaches the database principal', async () => {
    const req = requestWith(`Bearer ${accessTokenFor('STUDENT')}`);

    const error = await run(requireAuth(principalDb([studentRow]), config), req);

    expect(error).toBeUndefined();
    expect(req.auth).toMatchObject({
      id: studentRow.id,
      role: 'STUDENT',
      name: 'Ananya Menon',
      rollNumber: 'NTTF2026001',
    });
  });

  it('rejects a missing Authorization header', async () => {
    const error = (await run(
      requireAuth(principalDb([studentRow]), config),
      requestWith(),
    )) as AppError;

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a non-bearer scheme', async () => {
    const error = (await run(
      requireAuth(principalDb([studentRow]), config),
      requestWith('Basic abc'),
    )) as AppError;

    expect(error.status).toBe(401);
    expect(error.message).toBe('A valid bearer token is required.');
  });

  it('rejects a malformed token', async () => {
    const error = (await run(
      requireAuth(principalDb([studentRow]), config),
      requestWith('Bearer not.a.jwt'),
    )) as AppError;

    expect(error.status).toBe(401);
    expect(error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    const req = requestWith(`Bearer ${accessTokenFor('STUDENT', '-1s')}`);

    const error = (await run(requireAuth(principalDb([studentRow]), config), req)) as AppError;

    expect(error.status).toBe(401);
    expect(error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = signAccessToken(
      {
        sub: studentRow.id,
        sid: '33333333-3333-4333-8333-333333333333',
        role: 'STUDENT',
        type: 'access',
      },
      'an-attacker-controlled-secret-0123456789abcdef',
      '15m',
    );

    const error = (await run(
      requireAuth(principalDb([studentRow]), config),
      requestWith(`Bearer ${forged}`),
    )) as AppError;

    expect(error.status).toBe(401);
    expect(error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a valid token whose principal no longer exists or is inactive', async () => {
    const missing = (await run(
      requireAuth(principalDb([]), config),
      requestWith(`Bearer ${accessTokenFor('STUDENT')}`),
    )) as AppError;
    expect(missing.status).toBe(401);
    expect(missing.code).toBe('INVALID_SESSION');

    const inactiveAdmin = (await run(
      requireAuth(principalDb([{ ...adminRow, isActive: false }]), config),
      requestWith(`Bearer ${accessTokenFor('HOD')}`),
    )) as AppError;
    expect(inactiveAdmin.status).toBe(401);
    expect(inactiveAdmin.code).toBe('INVALID_SESSION');
  });

  it('uses the database role, not the token claim, as authoritative', async () => {
    const req = requestWith(`Bearer ${accessTokenFor('SUPER_ADMIN')}`);

    const error = await run(requireAuth(principalDb([adminRow]), config), req);

    expect(error).toBeUndefined();
    expect(req.auth?.role).toBe('HOD');
  });
});

describe('requireRoles permission matrix', () => {
  const ALL_ROLES: PrincipalRole[] = ['STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN'];

  const ENDPOINTS = [
    { name: 'student area', allowed: ['STUDENT'] },
    { name: 'admin staff area', allowed: ['CLERK', 'HOD', 'SUPER_ADMIN'] },
    { name: 'clerk verification', allowed: ['CLERK', 'SUPER_ADMIN'] },
    { name: 'HOD decision', allowed: ['HOD', 'SUPER_ADMIN'] },
  ] as const;

  it.each(ENDPOINTS)('enforces every role against the $name', async ({ allowed }) => {
    for (const role of ALL_ROLES) {
      const req = { auth: { role } } as Request;
      const error = await new Promise((resolve) => {
        requireRoles(...(allowed as unknown as PrincipalRole[]))(req, response, ((
          received?: unknown,
        ) => resolve(received)) as NextFunction);
      });

      if (allowed.includes(role as never)) {
        expect(error, `${role} should reach ${allowed.join('/')}`).toBeUndefined();
      } else {
        expect(error, `${role} should be blocked`).toBeInstanceOf(AppError);
        expect((error as AppError).status).toBe(403);
        expect((error as AppError).code).toBe('FORBIDDEN');
      }
    }
  });

  it('requires an authenticated principal', () => {
    const next = vi.fn();
    requireRoles('HOD')({} as Request, response, next);
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.status).toBe(401);
  });
});

describe('password-change gate', () => {
  it('blocks principals that must change their password', () => {
    const next = vi.fn();
    requirePasswordChanged({ auth: { mustChangePassword: true } } as Request, response, next);
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.status).toBe(403);
    expect(error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows principals with a permanent password', () => {
    const next = vi.fn();
    requirePasswordChanged({ auth: { mustChangePassword: false } } as Request, response, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('principal id guards', () => {
  it('returns the student id for student principals', () => {
    const req = { auth: { id: 'student-1', role: 'STUDENT' } } as Request;
    expect(requireStudentId(req)).toBe('student-1');
  });

  it('forbids staff from student resources', () => {
    expect(() =>
      requireStudentId({ auth: { id: 'admin-1', role: 'CLERK' } } as Request),
    ).toThrowError(AppError);
  });

  it('returns the admin id for staff principals', () => {
    const req = { auth: { id: 'admin-1', role: 'HOD' } } as Request;
    expect(requireAdminId(req)).toBe('admin-1');
  });

  it('forbids students from staff resources', () => {
    expect(() =>
      requireAdminId({ auth: { id: 'student-1', role: 'STUDENT' } } as Request),
    ).toThrowError(AppError);
  });
});
