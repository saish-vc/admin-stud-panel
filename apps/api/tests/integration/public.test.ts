import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/client.js';
import { createTestApp } from '../helpers/app.js';
import { createTestConfig } from '../helpers/config.js';
import { withTestTransaction } from '../helpers/db.js';
import { seedCertificate, seedRequest, seedStudent } from '../helpers/fixtures.js';

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await pool.end();
});

describe('public certificate verification', () => {
  it('returns the official register details for a valid code', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student } = await seedStudent(db, {
        fullName: 'Sara Thomas',
        programme: 'Diploma in Electronics & Communication Engineering',
      });
      const ready = await seedRequest(db, {
        studentId: student.studentId,
        status: 'READY',
      });
      const code = `NTTF-VERIFY-${randomUUID()}`;
      const certificateNumber = `NTTF/TEST/${randomUUID()}`;
      const certificate = await seedCertificate(db, {
        requestId: ready.requestId,
        certificateNumber,
        verificationCode: code,
      });
      const { app } = createTestApp(db);

      const response = await request(app).get(`/api/verify/${code}`);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.data).toMatchObject({
        valid: true,
        certificateNumber,
        certificateType: 'BONAFIDE',
        holderName: 'Sara Thomas',
        rollNumber: student.rollNumber,
        programme: 'Diploma in Electronics & Communication Engineering',
      });
      expect(new Date(response.body.data.issuedAt).getTime()).toBe(
        certificate.generatedAt.getTime(),
      );
      expect(response.body.data).not.toHaveProperty('email');
      expect(response.body.data).not.toHaveProperty('dateOfBirth');
    });
  });

  it('returns a generic 404 for an unknown code', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/api/verify/NTTF-UNKNOWN-CODE-0001');
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe(
        'No valid certificate matches this verification code.',
      );
    });
  });

  it('rejects a malformed code without touching the database', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/api/verify/short');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('rate-limits verification scraping attempts', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await request(app).get('/api/verify/NTTF-RATE-LIMIT-0001');
        expect(response.status).toBe(404);
      }
      const limited = await request(app).get('/api/verify/NTTF-RATE-LIMIT-0001');
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    });
  });
});

describe('health checks', () => {
  it('reports liveness without a database call', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/health/liveness');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'nttf-certificate-portal',
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  it('reports readiness after a database round trip', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      const response = await request(app).get('/health/readiness');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready', database: 'ok' });
    });
  });
});

describe('OpenAPI documentation hosting', () => {
  it('is disabled unless explicitly enabled', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      await expect(request(app).get('/api/docs/')).resolves.toMatchObject({ status: 404 });
    });
  });

  it('serves Swagger UI from a valid OpenAPI file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'nttf-openapi-'));
    const file = path.join(directory, 'openapi.yaml');
    await writeFile(
      file,
      'openapi: 3.0.3\ninfo:\n  title: NTTF Test API\n  version: 1.0.0\npaths: {}\n',
      'utf8',
    );
    try {
      await withTestTransaction(pool, async (db) => {
        const config = createTestConfig({ enableDocs: true, openApiPath: file });
        const { app } = createTestApp(db, { config });
        const response = await request(app).get('/api/docs/');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('id="swagger-ui"');
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('returns 503 when the OpenAPI document is not installed', async () => {
    await withTestTransaction(pool, async (db) => {
      const config = createTestConfig({
        enableDocs: true,
        openApiPath: path.join(tmpdir(), 'nttf-missing-openapi.yaml'),
      });
      const { app } = createTestApp(db, { config });
      const response = await request(app).get('/api/docs/');
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('DOCS_UNAVAILABLE');
    });
  });
});
