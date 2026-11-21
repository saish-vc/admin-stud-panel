import type { Express } from 'express';
import request from 'supertest';
import type { Response } from 'supertest';

export function loginStudent(
  app: Express,
  rollNumber: string,
  password: string,
): Promise<Response> {
  return request(app).post('/api/auth/student/login').send({ rollNumber, password });
}

export function loginAdmin(app: Express, email: string, password: string): Promise<Response> {
  return request(app).post('/api/auth/admin/login').send({ email, password });
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export function accessToken(response: Response): string {
  const token = (response.body as { data?: { accessToken?: string } }).data?.accessToken;
  if (!token) throw new Error(`No access token in response: ${JSON.stringify(response.body)}`);
  return token;
}

/** Returns the Cookie request header value for the rotating refresh cookie. */
export function refreshCookie(response: Response): string {
  const header = response.headers['set-cookie'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new Error('No refresh cookie was set');
  return raw.split(';')[0] ?? raw;
}
