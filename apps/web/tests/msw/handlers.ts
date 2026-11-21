import { http, HttpResponse } from 'msw';
import type { AdminQueueItem, AuthSession, AuthUser, VerificationResult } from '@/types';

export const studentUser: AuthUser = {
  id: 'student-1',
  role: 'STUDENT',
  name: 'Ananya Menon',
  email: 'ananya@students.nttf.ac.in',
  mustChangePassword: false,
  rollNumber: 'NTTF2026001',
  programme: 'Diploma in Mechanical Engineering',
};

export const studentSession: AuthSession = {
  accessToken: 'student-access-token',
  user: studentUser,
};

export const clerkUser: AuthUser = {
  id: 'staff-1',
  role: 'CLERK',
  name: 'Verification Clerk',
  email: 'clerk@nttf.ac.in',
  mustChangePassword: false,
};

export const clerkSession: AuthSession = {
  accessToken: 'clerk-access-token',
  user: clerkUser,
};

export const verifiedCertificate: VerificationResult = {
  valid: true,
  certificateNumber: 'NTTF/2026/BF/0001',
  certificateType: 'BONAFIDE',
  holderName: 'Ananya Menon',
  rollNumber: 'NTTF2026001',
  programme: 'Diploma in Mechanical Engineering',
  issuedAt: '2026-02-02T11:31:00.000Z',
};

export const queueItem: AdminQueueItem = {
  requestId: '11111111-1111-4111-8111-111111111111',
  rollNumber: 'NTTF2026001',
  studentName: 'Ananya Menon',
  programme: 'Diploma in Mechanical Engineering',
  batchYear: 2023,
  certificateType: 'BONAFIDE',
  status: 'SUBMITTED',
  purpose: 'Bank education loan application.',
  hasSupportingDocument: false,
  createdAt: '2026-01-15T09:00:00.000Z',
};

export function errorResponse(status: number, code: string, message: string): Response {
  return HttpResponse.json({ error: { code, message } }, { status });
}

export const handlers = [
  http.post('/api/auth/refresh', () => errorResponse(401, 'INVALID_SESSION', 'No active session.')),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/verify/:code', () =>
    errorResponse(404, 'CERTIFICATE_NOT_FOUND', 'No certificate matches this code.'),
  ),
  http.get('/api/admin/requests', () =>
    HttpResponse.json({ data: { items: [], page: 1, limit: 15, total: 0 } }),
  ),
];
