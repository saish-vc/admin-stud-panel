import { z } from 'zod';
import {
  ADMIN_ROLES,
  CERTIFICATE_TYPES,
  REQUEST_STATUSES,
  type CertificateType,
  type RequestStatus,
} from '../db/schema.js';
import { validateNewPassword } from './password.js';

export const loginStudentSchema = z.object({
  rollNumber: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Roll number may contain letters, numbers, and hyphens only'),
  password: z.string().min(1).max(128),
});

export const loginAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(100),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'The new password must differ from the current password.',
      });
    }
    const validation = validateNewPassword(value.newPassword);
    if (!validation.valid) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: `Password must contain ${validation.errors.join(', ')}.`,
      });
    }
  });

export const requestIdParamsSchema = z.object({
  requestId: z.string().uuid('A valid request ID is required.'),
});

export const requestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminRequestQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(CERTIFICATE_TYPES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createRequestSchema = z.object({
  certificateType: z.enum(CERTIFICATE_TYPES),
  purpose: z
    .string()
    .trim()
    .min(10, 'Purpose must be at least 10 characters.')
    .max(1000, 'Purpose must be at most 1,000 characters.'),
});

export const verifyRequestSchema = z.object({
  remarks: z.string().trim().max(2000).optional(),
});

export const decisionRequestSchema = z.object({
  remarks: z.string().trim().max(2000).optional(),
});

export const rejectRequestSchema = z.object({
  remarks: z
    .string()
    .trim()
    .min(3, 'Rejection remarks are required.')
    .max(2000, 'Remarks must be at most 2,000 characters.'),
});

export const verificationCodeSchema = z.object({
  code: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export function normalizeRollNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function isCertificateType(value: unknown): value is CertificateType {
  return typeof value === 'string' && CERTIFICATE_TYPES.includes(value as CertificateType);
}

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && REQUEST_STATUSES.includes(value as RequestStatus);
}

export function isAdminRole(value: unknown): value is (typeof ADMIN_ROLES)[number] {
  return typeof value === 'string' && ADMIN_ROLES.includes(value as (typeof ADMIN_ROLES)[number]);
}
