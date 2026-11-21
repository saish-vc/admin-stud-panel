import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/client.js';
import type { AppDb } from '../../src/db/client.js';
import { auditLogs, certificateRequests, type AdminRole } from '../../src/db/schema.js';
import type { PdfGenerator } from '../../src/services/admin.service.js';
import { createTestApp } from '../helpers/app.js';
import { withTestTransaction } from '../helpers/db.js';
import {
  failingPdfGenerator,
  seedAdmin,
  seedCertificate,
  seedRequest,
  seedStudent,
  stubPdfGenerator,
} from '../helpers/fixtures.js';
import { accessToken, bearer, loginAdmin } from '../helpers/http.js';

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await pool.end();
});

const PDF = Buffer.from('%PDF-1.7\nadmin supporting document\n');

async function staffToken(
  app: Express,
  role: AdminRole,
  email: string,
  password: string,
): Promise<string> {
  void role;
  return accessToken(await loginAdmin(app, email, password));
}

async function seedStaff(db: AppDb, role: AdminRole) {
  return seedAdmin(db, { role });
}

describe('administration queue and statistics', () => {
  it('reports status counts and issued totals', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedStaff(db, 'HOD');
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'HOD', staff.admin.email, staff.password);

      const before = await request(app).get('/api/admin/stats').set('Authorization', bearer(token));
      expect(before.status).toBe(200);

      const student = await seedStudent(db);
      await seedRequest(db, { studentId: student.student.studentId, status: 'SUBMITTED' });
      await seedRequest(db, { studentId: student.student.studentId, status: 'SUBMITTED' });
      const approved = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'READY',
      });
      await seedCertificate(db, { requestId: approved.requestId });

      const after = await request(app).get('/api/admin/stats').set('Authorization', bearer(token));
      expect(after.body.data.byStatus.SUBMITTED - before.body.data.byStatus.SUBMITTED).toBe(2);
      expect(after.body.data.byStatus.READY - before.body.data.byStatus.READY).toBe(1);
      expect(after.body.data.totalIssued - before.body.data.totalIssued).toBe(1);
      expect(after.body.data.awaitingVerification).toBe(after.body.data.byStatus.SUBMITTED);
      expect(after.body.data.awaitingApproval).toBe(after.body.data.byStatus.UNDER_VERIFICATION);
    });
  });

  it('filters the queue by status, type, and search term', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db, { fullName: 'Sara Thomas' });
      const other = await seedStudent(db);
      const bonafide = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'SUBMITTED',
        certificateType: 'BONAFIDE',
      });
      await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'READY',
        certificateType: 'LC',
      });
      await seedRequest(db, {
        studentId: other.student.studentId,
        status: 'SUBMITTED',
        certificateType: 'DIPLOMA',
      });
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'CLERK', staff.admin.email, staff.password);

      const byStudent = await request(app)
        .get(`/api/admin/requests?q=${encodeURIComponent(student.student.rollNumber)}`)
        .set('Authorization', bearer(token));
      expect(byStudent.status).toBe(200);
      expect(byStudent.body.data.total).toBe(2);
      expect(
        byStudent.body.data.items.every(
          (item: { rollNumber: string }) => item.rollNumber === student.student.rollNumber,
        ),
      ).toBe(true);

      const byName = await request(app)
        .get('/api/admin/requests?q=Sara')
        .set('Authorization', bearer(token));
      expect(byName.body.data.items[0].studentName).toBe('Sara Thomas');

      const byStatus = await request(app)
        .get(`/api/admin/requests?status=SUBMITTED&q=${student.student.rollNumber}`)
        .set('Authorization', bearer(token));
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].requestId).toBe(bonafide.requestId);

      const byType = await request(app)
        .get(`/api/admin/requests?type=LC&q=${student.student.rollNumber}`)
        .set('Authorization', bearer(token));
      expect(byType.body.data.items).toHaveLength(1);
      expect(byType.body.data.items[0].certificateType).toBe('LC');

      const invalid = await request(app)
        .get('/api/admin/requests?limit=500')
        .set('Authorization', bearer(token));
      expect(invalid.status).toBe(400);
    });
  });

  it('returns request detail with the student record and timeline', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedStaff(db, 'HOD');
      const student = await seedStudent(db, { fullName: 'Sara Thomas' });
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'REJECTED',
        adminRemarks: 'Incomplete purpose.',
      });
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'HOD', staff.admin.email, staff.password);

      const response = await request(app)
        .get(`/api/admin/requests/${seeded.requestId}`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data.student).toMatchObject({
        rollNumber: student.student.rollNumber,
        fullName: 'Sara Thomas',
        programme: student.student.programme,
      });
      expect(response.body.data.certificate).toBeNull();
      expect(response.body.data.adminRemarks).toBe('Incomplete purpose.');

      const missing = await request(app)
        .get('/api/admin/requests/2b0601f1-45af-4f0e-bb0d-9f3d1208c2a4')
        .set('Authorization', bearer(token));
      expect(missing.status).toBe(404);

      const malformed = await request(app)
        .get('/api/admin/requests/not-a-uuid')
        .set('Authorization', bearer(token));
      expect(malformed.status).toBe(400);
    });
  });

  it('streams supporting documents to authorized staff', async () => {
    await withTestTransaction(pool, async (db) => {
      const staff = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db);
      const documentKey = 'documents/admin-view.pdf';
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        documentKey,
      });
      const { app, storage } = createTestApp(db);
      await storage.put(documentKey, PDF, 'application/pdf');
      const token = await staffToken(app, 'CLERK', staff.admin.email, staff.password);

      const response = await request(app)
        .get(`/api/admin/requests/${seeded.requestId}/document`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(response.body).equals(PDF)).toBe(true);

      const missing = await request(app)
        .get(
          `/api/admin/requests/${(await seedRequest(db, { studentId: student.student.studentId })).requestId}/document`,
        )
        .set('Authorization', bearer(token));
      expect(missing.status).toBe(404);
    });
  });
});

describe('clerk document verification', () => {
  it('transitions SUBMITTED to UNDER_VERIFICATION and writes an audit entry', async () => {
    await withTestTransaction(pool, async (db) => {
      const clerk = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, { studentId: student.student.studentId });
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'CLERK', clerk.admin.email, clerk.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/verify`)
        .set('Authorization', bearer(token))
        .send({ remarks: 'Master record and document match.' });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'UNDER_VERIFICATION',
        adminRemarks: 'Master record and document match.',
        verifiedAt: expect.any(String),
      });
      expect(response.body.data.timeline[0]).toMatchObject({
        action: 'VERIFIED_DOCS',
        actorRole: 'CLERK',
        fromStatus: 'SUBMITTED',
        statusAfter: 'UNDER_VERIFICATION',
      });

      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, seeded.requestId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: clerk.admin.adminId,
        actorRole: 'CLERK',
        action: 'VERIFIED_DOCS',
        remarks: 'Master record and document match.',
      });
    });
  });

  it('forbids HOD from performing clerk verification', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, { studentId: student.student.studentId });
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/verify`)
        .set('Authorization', bearer(token))
        .send({});
      expect(response.status).toBe(403);
    });
  });

  it('rejects verification from an invalid state', async () => {
    await withTestTransaction(pool, async (db) => {
      const clerk = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'UNDER_VERIFICATION',
      });
      const { app } = createTestApp(db);
      const token = await staffToken(app, 'CLERK', clerk.admin.email, clerk.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/verify`)
        .set('Authorization', bearer(token))
        .send({});
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });
});

describe('HOD decisions and certificate issuance', () => {
  it('approves a verified request, generates the PDF, and audits both transitions', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db, { fullName: 'Ananya Menon' });
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'UNDER_VERIFICATION',
        purpose: 'Education loan application.',
      });
      const { app, storage } = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/approve`)
        .set('Authorization', bearer(token))
        .send({ remarks: 'Approved after verifying the supporting document.' });
      expect(response.status).toBe(200);
      expect(response.body.data.generationWarning).toBeNull();
      const requestView = response.body.data.request;
      expect(requestView.status).toBe('READY');
      expect(requestView.certificate).toMatchObject({
        certificateNumber: expect.stringMatching(/^NTTF\/BONAFIDE\/\d{4}\/[0-9A-F]{8}$/),
        verificationPath: expect.stringMatching(/^\/verify\//),
        generatedAt: expect.any(String),
      });
      expect(storage.objects.size).toBe(1);
      const entry = [...storage.objects.entries()][0];
      if (!entry) throw new Error('Expected a stored certificate');
      const [key, object] = entry;
      expect(key).toMatch(/^certificates\/[0-9a-f-]{36}\.pdf$/);
      expect(object?.data.subarray(0, 4).toString('latin1')).toBe('%PDF');

      const timeline = requestView.timeline.map((entry: { action: string }) => entry.action);
      expect(timeline).toEqual(['GENERATED_PDF', 'APPROVED']);

      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, seeded.requestId));
      expect(rows.map((row) => row.action).sort()).toEqual(['APPROVED', 'GENERATED_PDF']);
      const generated = rows.find((row) => row.action === 'GENERATED_PDF');
      expect(generated?.metadata).toMatchObject({
        certificateNumber: requestView.certificate.certificateNumber,
      });

      const download = await request(app)
        .get(`/api/admin/requests/${seeded.requestId}/certificate`)
        .set('Authorization', bearer(token));
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('application/pdf');
    });
  });

  it('preserves APPROVED and records GENERATION_FAILED after three renderer attempts', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'APPROVED',
      });
      const failing = failingPdfGenerator();
      const { app } = createTestApp(db, { generatePdf: failing.generate });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data.generationWarning).toContain('generation failed');
      expect(response.body.data.request.status).toBe('APPROVED');
      expect(failing.attempts()).toBe(3);

      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, seeded.requestId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'GENERATION_FAILED',
        fromStatus: 'APPROVED',
        statusAfter: 'APPROVED',
      });
      expect(rows[0]?.metadata).toMatchObject({ attempts: 3 });
    });
  });

  it('recovers a failed generation when the HOD retries later', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'APPROVED',
      });
      const failing = failingPdfGenerator();
      const first = createTestApp(db, { generatePdf: failing.generate });
      const token = await staffToken(first.app, 'HOD', hod.admin.email, hod.password);

      const failed = await request(first.app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(failed.body.data.request.status).toBe('APPROVED');

      const retry = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const retryToken = await staffToken(retry.app, 'HOD', hod.admin.email, hod.password);
      const recovered = await request(retry.app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(retryToken));
      expect(recovered.body.data.request.status).toBe('READY');
      expect(recovered.body.data.generationWarning).toBeNull();
    });
  });

  it('treats generation of an already-issued request as idempotent', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'APPROVED',
      });
      const { app } = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const first = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(first.status).toBe(200);
      const certificateNumber = first.body.data.request.certificate.certificateNumber;

      const second = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(second.status).toBe(200);
      expect(second.body.data.request.certificate.certificateNumber).toBe(certificateNumber);
    });
  });

  it('returns the committed certificate when the insert conflicts with an existing row', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'APPROVED',
      });
      const existing = await seedCertificate(db, { requestId: seeded.requestId });
      const { app, storage } = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(200);
      expect(response.body.data.generationWarning).toBeNull();
      expect(response.body.data.request.certificate.certificateNumber).toBe(
        existing.certificateNumber,
      );
      // The upload from the losing attempt must be cleaned up.
      expect(storage.objects.size).toBe(0);
    });
  });

  it('aborts issuance when the request leaves APPROVED while the PDF renders', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const seeded = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'APPROVED',
      });
      const render = stubPdfGenerator();
      const racingRender: PdfGenerator = async (data) => {
        await db
          .update(certificateRequests)
          .set({ status: 'READY' })
          .where(eq(certificateRequests.requestId, seeded.requestId));
        return render(data);
      };
      const { app, storage } = createTestApp(db, { generatePdf: racingRender });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const response = await request(app)
        .post(`/api/admin/requests/${seeded.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(storage.objects.size).toBe(0);
    });
  });

  it('refuses approval before verification and generations before approval', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const student = await seedStudent(db);
      const submitted = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'SUBMITTED',
      });
      const { app } = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const token = await staffToken(app, 'HOD', hod.admin.email, hod.password);

      const approval = await request(app)
        .post(`/api/admin/requests/${submitted.requestId}/approve`)
        .set('Authorization', bearer(token))
        .send({});
      expect(approval.status).toBe(409);

      const generation = await request(app)
        .post(`/api/admin/requests/${submitted.requestId}/generate`)
        .set('Authorization', bearer(token));
      expect(generation.status).toBe(409);
    });
  });

  it('rejects with mandatory remarks and only from submitted or verified states', async () => {
    await withTestTransaction(pool, async (db) => {
      const hod = await seedStaff(db, 'HOD');
      const clerk = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db);
      const submitted = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'SUBMITTED',
      });
      const exhausted = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'READY',
      });
      const { app } = createTestApp(db);
      const hodToken = await staffToken(app, 'HOD', hod.admin.email, hod.password);
      const clerkToken = await staffToken(app, 'CLERK', clerk.admin.email, clerk.password);

      const missingRemarks = await request(app)
        .post(`/api/admin/requests/${submitted.requestId}/reject`)
        .set('Authorization', bearer(hodToken))
        .send({ remarks: '' });
      expect(missingRemarks.status).toBe(400);

      const success = await request(app)
        .post(`/api/admin/requests/${submitted.requestId}/reject`)
        .set('Authorization', bearer(hodToken))
        .send({ remarks: 'The purpose is unclear. Name the organisation.' });
      expect(success.status).toBe(200);
      expect(success.body.data).toMatchObject({
        status: 'REJECTED',
        adminRemarks: 'The purpose is unclear. Name the organisation.',
      });

      const forbidden = await request(app)
        .post(`/api/admin/requests/${submitted.requestId}/reject`)
        .set('Authorization', bearer(clerkToken))
        .send({ remarks: 'Clerk must not be able to reject.' });
      expect(forbidden.status).toBe(403);

      const invalidState = await request(app)
        .post(`/api/admin/requests/${exhausted.requestId}/reject`)
        .set('Authorization', bearer(hodToken))
        .send({ remarks: 'Attempting to reject a completed request.' });
      expect(invalidState.status).toBe(409);
    });
  });

  it('forbids clerks from approving, rejecting, and generating', async () => {
    await withTestTransaction(pool, async (db) => {
      const clerk = await seedStaff(db, 'CLERK');
      const student = await seedStudent(db);
      const requestRow = await seedRequest(db, {
        studentId: student.student.studentId,
        status: 'UNDER_VERIFICATION',
      });
      const { app } = createTestApp(db, { generatePdf: stubPdfGenerator() });
      const token = await staffToken(app, 'CLERK', clerk.admin.email, clerk.password);

      for (const action of ['approve', 'reject', 'generate']) {
        const response = await request(app)
          .post(`/api/admin/requests/${requestRow.requestId}/${action}`)
          .set('Authorization', bearer(token))
          .send(action === 'reject' ? { remarks: 'Clerk cannot reject.' } : {});
        expect(response.status).toBe(403);
      }
    });
  });
});
