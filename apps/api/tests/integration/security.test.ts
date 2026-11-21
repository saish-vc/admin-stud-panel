import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/client.js';
import { adminUsers, auditLogs, students } from '../../src/db/schema.js';
import { createTestApp } from '../helpers/app.js';
import { withTestTransaction } from '../helpers/db.js';
import { seedAdmin, seedAudit, seedRequest, seedStudent } from '../helpers/fixtures.js';
import { accessToken, bearer, loginAdmin, loginStudent } from '../helpers/http.js';

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await pool.end();
});

async function studentToken(app: Express, rollNumber: string, password: string) {
  return accessToken(await loginStudent(app, rollNumber, password));
}

describe('OWASP API1/A2: broken object and function level authorization', () => {
  it('prevents a student from reading, resubmitting, or downloading another student object', async () => {
    await withTestTransaction(pool, async (db) => {
      const owner = await seedStudent(db);
      const intruder = await seedStudent(db);
      const victimRequest = await seedRequest(db, {
        studentId: owner.student.studentId,
        documentKey: 'documents/private.pdf',
        status: 'REJECTED',
      });
      const { app, storage } = createTestApp(db);
      await storage.put('documents/private.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');
      const token = await studentToken(app, intruder.student.rollNumber, intruder.password);

      for (const path of [
        `/api/student/requests/${victimRequest.requestId}`,
        `/api/student/requests/${victimRequest.requestId}/document`,
        `/api/student/requests/${victimRequest.requestId}/certificate`,
        `/api/student/requests/${victimRequest.requestId}/verification`,
      ]) {
        const response = await request(app).get(path).set('Authorization', bearer(token));
        expect(response.status).toBe(404);
      }

      const resubmit = await request(app)
        .post(`/api/student/requests/${victimRequest.requestId}/resubmit`)
        .set('Authorization', bearer(token))
        .send({ purpose: 'Hijacked purpose text for a victim request.' });
      expect(resubmit.status).toBe(404);

      const stillRejected = await request(app)
        .get(`/api/admin/requests/${victimRequest.requestId}`)
        .set('Authorization', bearer(token));
      expect(stillRejected.status).toBe(403);
    });
  });

  it('ignores client-supplied ownership and workflow fields', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const other = await seedStudent(db);
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.student.rollNumber, student.password);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .send({
          studentId: other.student.studentId,
          certificateType: 'BONAFIDE',
          purpose: 'Mass assignment attempt for a certificate request.',
          status: 'READY',
          adminRemarks: 'Self approved',
        });
      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('SUBMITTED');
      expect(response.body.data.adminRemarks).toBeNull();
      expect(response.body.data).not.toHaveProperty('studentId');

      const read = await request(app)
        .get(`/api/student/requests/${response.body.data.requestId}`)
        .set('Authorization', bearer(token));
      expect(read.status).toBe(200);
    });
  });
});

describe('OWASP API2: broken authentication and session management', () => {
  it('rejects the alg=none JWT forgery', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: randomUUID(),
          sid: randomUUID(),
          role: 'SUPER_ADMIN',
          type: 'access',
          iss: 'nttf-portal',
          aud: 'nttf-web',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', bearer(`${header}.${payload}.`));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  it('does not accept the refresh cookie as an access credential', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.student.rollNumber, student.password);
      const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
      expect(cookie).toBeTruthy();

      const response = await request(app).get('/api/student/profile').set('Cookie', cookie!);
      expect(response.status).toBe(401);
    });
  });

  it('invalidates an access token as soon as the account is deactivated', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.student.rollNumber, student.password);

      await db
        .update(students)
        .set({ status: 'DROPPED' })
        .where(eq(students.studentId, student.student.studentId));

      const response = await request(app)
        .get('/api/student/profile')
        .set('Authorization', bearer(token));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_SESSION');
    });
  });

  it('invalidates staff access when their database account is deactivated', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedAdmin(db, { role: 'CLERK' });
      const { app } = createTestApp(db);
      const login = await loginAdmin(app, staff.admin.email, staff.password);
      const token = accessToken(login);

      await db
        .update(adminUsers)
        .set({ isActive: false })
        .where(eq(adminUsers.adminId, staff.admin.adminId));

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', bearer(token));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_SESSION');
    });
  });

  it('sets hardened refresh-cookie attributes', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.student.rollNumber, student.password);
      const cookie = login.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).not.toContain('Secure');
    });
  });
});

describe('OWASP API3/API7: injection and data exposure', () => {
  it('treats SQL metacharacters in search as literal text', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedAdmin(db, { role: 'HOD' });
      const student = await seedStudent(db);
      await seedRequest(db, { studentId: student.student.studentId });
      const { app } = createTestApp(db);
      const login = await loginAdmin(app, staff.admin.email, staff.password);
      const token = accessToken(login);

      for (const query of ["' OR 1=1 --", "'; DROP TABLE students; --", '%', '_%\\']) {
        const response = await request(app)
          .get(`/api/admin/requests?q=${encodeURIComponent(query)}`)
          .set('Authorization', bearer(token));
        expect(response.status).toBe(200);
      }

      const stillThere = await db.select().from(students).limit(1);
      expect(stillThere.length).toBeGreaterThan(0);
    });
  });

  it('never serialises password hashes or internal storage keys', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedAdmin(db, { role: 'HOD' });
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        documentKey: 'documents/internal.pdf',
      });
      const { app } = createTestApp(db);
      const login = await loginAdmin(app, staff.admin.email, staff.password);
      const token = accessToken(login);

      const response = await request(app)
        .get(`/api/admin/requests/${seeded.requestId}`)
        .set('Authorization', bearer(token));
      const serialised = JSON.stringify(response.body);
      expect(response.status).toBe(200);
      expect(serialised).not.toMatch(/passwordHash|password_hash/i);
      expect(serialised).not.toMatch(/documents\/internal\.pdf/);
    });
  });

  it('applies a hard request-body size limit', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.student.rollNumber, student.password);
      const token = accessToken(login);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .set('Content-Type', 'application/json')
        .send({ certificateType: 'BONAFIDE', purpose: 'x'.repeat(1_100_000) });
      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
});

describe('OWASP API5/API6/API8: configuration and integrity', () => {
  it('sets security headers and hides the server implementation', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/health/liveness');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-request-id']).toBeTruthy();
    });
  });

  it('allows configured origins and rejects unknown browsers', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app, config } = createTestApp(db);
      const allowedOrigin = config.webOrigins[0]!;

      const allowed = await request(app)
        .get('/api/verify/NTTF-CORS-TEST-0001')
        .set('Origin', allowedOrigin);
      expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const denied = await request(app)
        .get('/api/verify/NTTF-CORS-TEST-0001')
        .set('Origin', 'https://evil.example');
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('CORS_ORIGIN_DENIED');
    });
  });

  it('makes audit events append-only at the database layer', async () => {
    await withTestTransaction(pool, async (db) => {
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, { studentId: student.student.studentId });
      await seedAudit(db, {
        requestId: seeded.requestId,
        actorStudentId: student.student.studentId,
        action: 'SUBMITTED',
      });
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, seeded.requestId));

      await expect(
        db.transaction(async (tx) => {
          await tx.execute(
            sql`update audit_logs set remarks = 'tampered' where log_id = ${audit!.logId}`,
          );
        }),
      ).rejects.toThrow();

      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`delete from audit_logs where log_id = ${audit!.logId}`);
        }),
      ).rejects.toThrow();

      const [unchanged] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.logId, audit!.logId));
      expect(unchanged?.remarks).toBeNull();
    });
  });

  it('returns a request-specific error envelope without stack traces', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/api/does-not-exist');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.requestId).toBeTruthy();
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    });
  });
});
