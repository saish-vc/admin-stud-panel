import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/client.js';
import { auditLogs } from '../../src/db/schema.js';
import { createTestApp } from '../helpers/app.js';
import { createTestConfig } from '../helpers/config.js';
import { withTestTransaction } from '../helpers/db.js';
import { seedAdmin, seedCertificate, seedRequest, seedStudent } from '../helpers/fixtures.js';
import { accessToken, bearer, loginAdmin, loginStudent } from '../helpers/http.js';

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await pool.end();
});

const PDF = Buffer.from('%PDF-1.7\nintegration supporting document\n');

async function studentToken(app: Express, rollNumber: string, password: string): Promise<string> {
  return accessToken(await loginStudent(app, rollNumber, password));
}

describe('student profile and request creation', () => {
  it('returns only the signed-in student profile', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db, {
        fullName: 'Ananya Menon',
        programme: 'Diploma in Mechanical Engineering',
      });
      await seedStudent(db);
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .get('/api/student/profile')
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        studentId: student.studentId,
        rollNumber: student.rollNumber,
        fullName: 'Ananya Menon',
        dateOfBirth: '2003-04-15',
        programme: 'Diploma in Mechanical Engineering',
        batchYear: 2024,
        currentSemester: 4,
        status: 'ACTIVE',
      });
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });
  });

  it('creates a request with a private supporting document and audits it', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app, storage } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .field('certificateType', 'BONAFIDE')
        .field('purpose', 'Education loan application for a higher studies programme.')
        .attach('document', PDF, { filename: 'identity.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        certificateType: 'BONAFIDE',
        status: 'SUBMITTED',
        supportingDocument: true,
        adminRemarks: null,
        certificate: null,
      });
      expect(response.body.data.timeline).toHaveLength(1);
      expect(response.body.data.timeline[0]).toMatchObject({
        action: 'SUBMITTED',
        actorRole: 'STUDENT',
        statusAfter: 'SUBMITTED',
      });
      expect(storage.objects.size).toBe(1);
      const entry = [...storage.objects.entries()][0];
      if (!entry) throw new Error('Expected a stored document');
      const [key, object] = entry;
      expect(key).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
      expect(object?.contentType).toBe('application/pdf');
      expect(object?.data.equals(PDF)).toBe(true);

      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, response.body.data.requestId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorStudentId: student.studentId,
        actorId: null,
        actorRole: 'STUDENT',
        action: 'SUBMITTED',
        fromStatus: null,
        statusAfter: 'SUBMITTED',
      });
    });
  });

  it('creates a request without a document', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .send({ certificateType: 'DIPLOMA', purpose: 'Employer verification of my diploma.' });
      expect(response.status).toBe(201);
      expect(response.body.data.supportingDocument).toBe(false);
    });
  });

  it('validates certificate type, purpose, and upload signatures', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const shortPurpose = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .send({ certificateType: 'BONAFIDE', purpose: 'too short' });
      expect(shortPurpose.status).toBe(400);
      expect(shortPurpose.body.error.code).toBe('VALIDATION_ERROR');

      const badType = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .send({ certificateType: 'MARKSHEET', purpose: 'A valid and sufficiently long purpose.' });
      expect(badType.status).toBe(400);

      const badFile = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .field('certificateType', 'BONAFIDE')
        .field('purpose', 'A valid and sufficiently long purpose.')
        .attach('document', Buffer.from('MZ executable'), {
          filename: 'malware.exe',
          contentType: 'application/octet-stream',
        });
      expect(badFile.status).toBe(415);
      expect(badFile.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

      const emptyFile = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .field('certificateType', 'BONAFIDE')
        .field('purpose', 'A valid and sufficiently long purpose.')
        .attach('document', Buffer.alloc(0), {
          filename: 'empty.pdf',
          contentType: 'application/pdf',
        });
      expect(emptyFile.status).toBe(400);
      expect(emptyFile.body.error.code).toBe('EMPTY_FILE');
    });
  });

  it('rejects uploads beyond the configured size limit', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const config = createTestConfig({ maxUploadBytes: 1024 });
      const { app } = createTestApp(db, { config });
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .field('certificateType', 'BONAFIDE')
        .field('purpose', 'A valid and sufficiently long purpose.')
        .attach('document', Buffer.concat([PDF, Buffer.alloc(2048, 0x20)]), {
          filename: 'large.pdf',
          contentType: 'application/pdf',
        });
      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    });
  });

  it('enforces the maximum number of open requests atomically', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      await seedRequest(db, { studentId: student.studentId, status: 'SUBMITTED' });
      await seedRequest(db, { studentId: student.studentId, status: 'SUBMITTED' });
      await seedRequest(db, { studentId: student.studentId, status: 'UNDER_VERIFICATION' });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post('/api/student/requests')
        .set('Authorization', bearer(token))
        .send({ certificateType: 'LC', purpose: 'Leaving certificate for a new employer.' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('OPEN_REQUEST_LIMIT');
    });
  });
});

describe('student request listing and ownership', () => {
  it('paginates requests newest first', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const first = await seedRequest(db, {
        studentId: student.studentId,
        purpose: 'Oldest request purpose for pagination.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const second = await seedRequest(db, {
        studentId: student.studentId,
        purpose: 'Middle request purpose for pagination.',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const third = await seedRequest(db, {
        studentId: student.studentId,
        purpose: 'Newest request purpose for pagination.',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .get('/api/student/requests?page=1&limit=2')
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(3);
      expect(response.body.data.limit).toBe(2);
      expect(response.body.data.items.map((item: { requestId: string }) => item.requestId)).toEqual(
        [third.requestId, second.requestId],
      );

      const pageTwo = await request(app)
        .get('/api/student/requests?page=2&limit=2')
        .set('Authorization', bearer(token));
      expect(pageTwo.body.data.items.map((item: { requestId: string }) => item.requestId)).toEqual([
        first.requestId,
      ]);

      const invalid = await request(app)
        .get('/api/student/requests?limit=1000')
        .set('Authorization', bearer(token));
      expect(invalid.status).toBe(400);
    });
  });

  it('does not disclose another student request', async () => {
    await withTestTransaction(pool, async (db) => {
      const owner = await seedStudent(db);
      const intruder = await seedStudent(db);
      const owned = await seedRequest(db, { studentId: owner.student.studentId });
      const { app } = createTestApp(db);
      const token = await studentToken(app, intruder.student.rollNumber, intruder.password);

      const read = await request(app)
        .get(`/api/student/requests/${owned.requestId}`)
        .set('Authorization', bearer(token));
      expect(read.status).toBe(404);

      const resubmit = await request(app)
        .post(`/api/student/requests/${owned.requestId}/resubmit`)
        .set('Authorization', bearer(token))
        .send({ purpose: 'Attempting to alter another student request.' });
      expect(resubmit.status).toBe(404);
    });
  });

  it('returns timelines for a single owned request', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const owned = await seedRequest(db, { studentId: student.studentId });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .get(`/api/student/requests/${owned.requestId}`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data.requestId).toBe(owned.requestId);
      expect(response.body.data.timeline).toEqual([]);

      const malformed = await request(app)
        .get('/api/student/requests/not-a-uuid')
        .set('Authorization', bearer(token));
      expect(malformed.status).toBe(400);
    });
  });
});

describe('student resubmission', () => {
  it('allows only rejected requests to be resubmitted', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const submitted = await seedRequest(db, {
        studentId: student.studentId,
        status: 'SUBMITTED',
      });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post(`/api/student/requests/${submitted.requestId}/resubmit`)
        .set('Authorization', bearer(token))
        .send({ purpose: 'A corrected purpose that should not be accepted.' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  it('resets a rejected request, replaces the document, and appends history', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const admin = await seedAdmin(db, { role: 'HOD' });
      const rejected = await seedRequest(db, {
        studentId: student.studentId,
        status: 'REJECTED',
        adminRemarks: 'The purpose is unclear.',
        verifiedBy: admin.admin.adminId,
        verifiedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const { app, storage } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);
      const newDocument = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

      const response = await request(app)
        .post(`/api/student/requests/${rejected.requestId}/resubmit`)
        .set('Authorization', bearer(token))
        .field('purpose', 'Corrected purpose naming the bank and the loan requirement.')
        .attach('document', newDocument, { filename: 'replacement.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'SUBMITTED',
        adminRemarks: null,
        verifiedAt: null,
        supportingDocument: true,
      });
      expect(response.body.data.timeline[0]).toMatchObject({
        action: 'SUBMITTED',
        fromStatus: 'REJECTED',
        statusAfter: 'SUBMITTED',
        actorRole: 'STUDENT',
      });
      expect([...storage.objects.keys()][0]).toMatch(/\.png$/);
    });
  });

  it('applies the open-request limit when resubmitting', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const rejected = await seedRequest(db, {
        studentId: student.studentId,
        status: 'REJECTED',
      });
      await seedRequest(db, { studentId: student.studentId, status: 'SUBMITTED' });
      await seedRequest(db, { studentId: student.studentId, status: 'SUBMITTED' });
      await seedRequest(db, { studentId: student.studentId, status: 'UNDER_VERIFICATION' });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .post(`/api/student/requests/${rejected.requestId}/resubmit`)
        .set('Authorization', bearer(token))
        .send({ purpose: 'A corrected purpose that exceeds the open request limit.' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('OPEN_REQUEST_LIMIT');
    });
  });
});

describe('student documents, certificates, and verification', () => {
  it('streams an owned supporting document privately', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const documentKey = 'documents/owned-evidence.pdf';
      const owned = await seedRequest(db, {
        studentId: student.studentId,
        documentKey,
      });
      const { app, storage } = createTestApp(db);
      await storage.put(documentKey, PDF, 'application/pdf');
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .get(`/api/student/requests/${owned.requestId}/document`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain(
        `${student.rollNumber}-supporting-document.pdf`,
      );
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(response.body).equals(PDF)).toBe(true);

      const other = await seedStudent(db);
      const otherToken = await studentToken(app, other.student.rollNumber, other.password);
      const forbidden = await request(app)
        .get(`/api/student/requests/${owned.requestId}/document`)
        .set('Authorization', bearer(otherToken));
      expect(forbidden.status).toBe(404);
    });
  });

  it('reports a missing supporting document', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const owned = await seedRequest(db, { studentId: student.studentId });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);
      const response = await request(app)
        .get(`/api/student/requests/${owned.requestId}/document`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(404);
    });
  });

  it('refuses certificate downloads until the request is READY', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const approved = await seedRequest(db, {
        studentId: student.studentId,
        status: 'APPROVED',
      });
      const { app } = createTestApp(db);
      const token = await studentToken(app, student.rollNumber, password);

      const response = await request(app)
        .get(`/api/student/requests/${approved.requestId}/certificate`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(404);

      const verification = await request(app)
        .get(`/api/student/requests/${approved.requestId}/verification`)
        .set('Authorization', bearer(token));
      expect(verification.status).toBe(404);
    });
  });

  it('streams the ready certificate and exposes verification metadata', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const ready = await seedRequest(db, { studentId: student.studentId, status: 'READY' });
      const certificate = await seedCertificate(db, {
        requestId: ready.requestId,
        objectKey: 'certificates/ready.pdf',
        verificationCode: 'NTTF-INTEGRATION-READY-0001',
      });
      const { app, storage } = createTestApp(db);
      await storage.put('certificates/ready.pdf', PDF, 'application/pdf');
      const token = await studentToken(app, student.rollNumber, password);

      const download = await request(app)
        .get(`/api/student/requests/${ready.requestId}/certificate`)
        .set('Authorization', bearer(token));
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('application/pdf');
      expect(download.headers['content-disposition']).toContain(
        `${student.rollNumber}-certificate.pdf`,
      );

      const verification = await request(app)
        .get(`/api/student/requests/${ready.requestId}/verification`)
        .set('Authorization', bearer(token));
      expect(verification.status).toBe(200);
      expect(verification.body.data).toMatchObject({
        certificateNumber: certificate.certificateNumber,
        verificationCode: 'NTTF-INTEGRATION-READY-0001',
        verificationPath: '/verify/NTTF-INTEGRATION-READY-0001',
        status: 'READY',
      });
    });
  });

  it('rejects administrator tokens on student routes', async () => {
    await withTestTransaction(pool, async (db) => {
      const { admin, password } = await seedAdmin(db, { role: 'CLERK' });
      const { app } = createTestApp(db);
      const login = await loginAdmin(app, admin.email, password);
      const response = await request(app)
        .get('/api/student/profile')
        .set('Authorization', bearer(accessToken(login)));
      expect(response.status).toBe(403);
    });
  });
});
