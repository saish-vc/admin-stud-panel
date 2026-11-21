import { describe, expect, it } from 'vitest';
import { AppError, errors, parseOrThrow } from '../../src/lib/errors.js';
import {
  adminRequestQuerySchema,
  changePasswordSchema,
  createRequestSchema,
  isAdminRole,
  isCertificateType,
  isRequestStatus,
  loginAdminSchema,
  loginStudentSchema,
  normalizeRollNumber,
  rejectRequestSchema,
  requestIdParamsSchema,
  requestQuerySchema,
  verificationCodeSchema,
  verifyRequestSchema,
} from '../../src/lib/validation.js';

const REQUEST_ID = '0b5c1f7e-7f8e-4dd5-bbd8-52aa66b5b6b7';

describe('request validation', () => {
  it('normalises and accepts student roll numbers', () => {
    expect(loginStudentSchema.parse({ rollNumber: ' nttf-2026-001 ', password: 'x' })).toEqual({
      rollNumber: 'nttf-2026-001',
      password: 'x',
    });
    expect(normalizeRollNumber(' nttf2026001 ')).toBe('NTTF2026001');
  });

  it('rejects roll numbers with path or SQL characters', () => {
    expect(loginStudentSchema.safeParse({ rollNumber: '../admin', password: 'x' }).success).toBe(
      false,
    );
    expect(loginStudentSchema.safeParse({ rollNumber: 'ab', password: 'x' }).success).toBe(false);
  });

  it('lowercases administrator emails', () => {
    expect(loginAdminSchema.parse({ email: ' Clerk@NTTF.ac.in ', password: 'secret' }).email).toBe(
      'clerk@nttf.ac.in',
    );
  });

  it('enforces password strength and difference on change', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'Student@E2E2026',
        newPassword: 'Student@E2E2026',
      }).success,
    ).toBe(false);

    const weak = changePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'weak',
    });
    expect(weak.success).toBe(false);
    if (!weak.success) {
      expect(weak.error.issues.some((issue) => issue.message.includes('at least 10'))).toBe(true);
    }

    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'Student@E2E2026',
        newPassword: 'Nttf@Portal2027',
      }).success,
    ).toBe(true);
  });

  it('validates UUID request parameters', () => {
    expect(requestIdParamsSchema.safeParse({ requestId: REQUEST_ID }).success).toBe(true);
    expect(requestIdParamsSchema.safeParse({ requestId: 'not-a-uuid' }).success).toBe(false);
  });

  it('bounds pagination and applies defaults', () => {
    expect(requestQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(requestQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(requestQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(requestQuerySchema.parse({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 });
  });

  it('validates admin queue filters', () => {
    expect(
      adminRequestQuerySchema.parse({
        status: 'UNDER_VERIFICATION',
        type: 'BONAFIDE',
        q: 'NTTF',
      }),
    ).toMatchObject({ status: 'UNDER_VERIFICATION', type: 'BONAFIDE', q: 'NTTF' });
    expect(adminRequestQuerySchema.safeParse({ status: 'UNKNOWN' }).success).toBe(false);
    expect(adminRequestQuerySchema.safeParse({ type: 'MARKSHEET' }).success).toBe(false);
  });

  it('requires a meaningful certificate purpose', () => {
    expect(
      createRequestSchema.safeParse({ certificateType: 'LC', purpose: 'short text' }).success,
    ).toBe(true);
    expect(createRequestSchema.safeParse({ certificateType: 'LC', purpose: 'short' }).success).toBe(
      false,
    );
    expect(
      createRequestSchema.safeParse({ certificateType: 'BONAFIDE', purpose: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
  });

  it('requires rejection remarks and accepts optional verification remarks', () => {
    expect(rejectRequestSchema.safeParse({ remarks: '' }).success).toBe(false);
    expect(rejectRequestSchema.safeParse({ remarks: 'Incomplete document' }).success).toBe(true);
    expect(verifyRequestSchema.parse({})).toEqual({});
    expect(verifyRequestSchema.safeParse({ remarks: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('validates public verification codes', () => {
    expect(verificationCodeSchema.safeParse({ code: 'NTTF-VERIFY-E2E-2026-0001' }).success).toBe(
      true,
    );
    expect(verificationCodeSchema.safeParse({ code: 'too-short' }).success).toBe(false);
    expect(verificationCodeSchema.safeParse({ code: 'INVALID CODE WITH SPACES' }).success).toBe(
      false,
    );
  });

  it('guards certificate types, statuses, and administrator roles', () => {
    expect(isCertificateType('BONAFIDE')).toBe(true);
    expect(isCertificateType('MARKSHEET')).toBe(false);
    expect(isRequestStatus('READY')).toBe(true);
    expect(isRequestStatus('GENERATING')).toBe(false);
    expect(isAdminRole('HOD')).toBe(true);
    expect(isAdminRole('STUDENT')).toBe(false);
  });
});

describe('validator boundaries', () => {
  it('enforces every required login field', () => {
    expect(loginStudentSchema.safeParse({}).success).toBe(false);
    expect(loginStudentSchema.safeParse({ rollNumber: 'NTTF2026001' }).success).toBe(false);
    expect(loginStudentSchema.safeParse({ rollNumber: 'NTTF2026001', password: '' }).success).toBe(
      false,
    );
    expect(loginAdminSchema.safeParse({ email: 'clerk@nttf.ac.in' }).success).toBe(false);
    expect(loginAdminSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(
      false,
    );
    expect(
      loginAdminSchema.safeParse({ email: `${'a'.repeat(92)}@nttf.ac.in`, password: 'x' }).success,
    ).toBe(false);
  });

  it('holds the roll number length at both edges', () => {
    expect(
      loginStudentSchema.safeParse({ rollNumber: 'A'.repeat(20), password: 'x' }).success,
    ).toBe(true);
    expect(
      loginStudentSchema.safeParse({ rollNumber: 'A'.repeat(21), password: 'x' }).success,
    ).toBe(false);
    expect(loginStudentSchema.safeParse({ rollNumber: 'ABC', password: 'x' }).success).toBe(false);
  });

  it('holds pagination at both edges', () => {
    expect(requestQuerySchema.safeParse({ page: '10000', limit: '1' }).success).toBe(true);
    expect(requestQuerySchema.safeParse({ page: '10001' }).success).toBe(false);
    expect(requestQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(requestQuerySchema.safeParse({ limit: '50' }).success).toBe(true);
    expect(adminRequestQuerySchema.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
    expect(adminRequestQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });

  it('holds the request purpose at both edges and requires a type', () => {
    expect(
      createRequestSchema.safeParse({ certificateType: 'LC', purpose: 'x'.repeat(10) }).success,
    ).toBe(true);
    expect(
      createRequestSchema.safeParse({ certificateType: 'LC', purpose: 'x'.repeat(9) }).success,
    ).toBe(false);
    expect(
      createRequestSchema.safeParse({ certificateType: 'LC', purpose: 'x'.repeat(1000) }).success,
    ).toBe(true);
    expect(createRequestSchema.safeParse({ purpose: 'Valid purpose text' }).success).toBe(false);
  });

  it('holds remark and verification-code edges', () => {
    expect(rejectRequestSchema.safeParse({ remarks: 'abc' }).success).toBe(true);
    expect(rejectRequestSchema.safeParse({ remarks: 'ab' }).success).toBe(false);
    expect(rejectRequestSchema.safeParse({ remarks: 'x'.repeat(2000) }).success).toBe(true);
    expect(rejectRequestSchema.safeParse({ remarks: 'x'.repeat(2001) }).success).toBe(false);
    expect(verificationCodeSchema.safeParse({ code: 'A'.repeat(16) }).success).toBe(true);
    expect(verificationCodeSchema.safeParse({ code: 'A'.repeat(64) }).success).toBe(true);
    expect(verificationCodeSchema.safeParse({ code: 'A'.repeat(65) }).success).toBe(false);
  });
});

describe('parseOrThrow', () => {
  it('returns the parsed value', () => {
    expect(parseOrThrow(requestQuerySchema, { page: '3' })).toEqual({ page: 3, limit: 20 });
  });

  it('throws a structured 400 with field details', () => {
    expect.assertions(5);
    try {
      parseOrThrow(loginStudentSchema, { rollNumber: 'x', password: '' });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.status).toBe(400);
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.message).toBe('One or more fields are invalid.');
      expect(appError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'rollNumber' }),
          expect.objectContaining({ path: 'password' }),
        ]),
      );
    }
  });
});

describe('error factories', () => {
  it('marks 4xx errors as exposed and 5xx errors as hidden', () => {
    expect(errors.badRequest().expose).toBe(true);
    expect(errors.notFound().status).toBe(404);
    expect(errors.conflict('state', 'INVALID_STATE_TRANSITION').code).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect(errors.tooLarge().status).toBe(413);
    expect(errors.unsupportedMedia().status).toBe(415);
    expect(errors.rateLimited().status).toBe(429);
    expect(errors.internal().expose).toBe(false);
  });
});
