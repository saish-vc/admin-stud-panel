import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { createPool } from '../../src/db/client.js';
import { adminUsers, authSessions } from '../../src/db/schema.js';
import { sha256 } from '../../src/lib/crypto.js';
import { JWT_AUDIENCE, JWT_ISSUER, signAccessToken } from '../../src/lib/jwt.js';
import { createTestApp } from '../helpers/app.js';
import { createTestConfig } from '../helpers/config.js';
import { withTestTransaction } from '../helpers/db.js';
import { seedAdmin, seedStudent } from '../helpers/fixtures.js';
import { accessToken, bearer, loginAdmin, loginStudent, refreshCookie } from '../helpers/http.js';

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await pool.end();
});

describe('student authentication', () => {
  it('signs in, returns the public profile, and refreshes with rotation', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db, {
        fullName: 'Ananya Menon',
      });
      const { app } = createTestApp(db);

      const login = await loginStudent(app, student.rollNumber.toLowerCase(), password);
      expect(login.status).toBe(200);
      expect(login.body.data.user).toMatchObject({
        id: student.studentId,
        role: 'STUDENT',
        name: 'Ananya Menon',
        rollNumber: student.rollNumber,
        programme: student.programme,
        mustChangePassword: false,
      });
      expect(login.headers['set-cookie']?.[0]).toContain('nttf_refresh=');
      expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', bearer(accessToken(login)));
      expect(me.status).toBe(200);
      expect(me.body.data.user.rollNumber).toBe(student.rollNumber);

      const firstCookie = refreshCookie(login);
      const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
      const rotatedCookie = refreshCookie(refreshed);
      expect(rotatedCookie).not.toBe(firstCookie);

      // Replaying the consumed refresh token revokes the whole session.
      const replay = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('REFRESH_REUSE');

      const afterReplay = await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie);
      expect(afterReplay.status).toBe(401);
      expect(afterReplay.body.error.code).toBe('INVALID_SESSION');
    });
  });

  it('rejects an unknown roll number and a wrong password with the same message', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);

      const unknown = await loginStudent(app, 'NTTF-DOES-NOT-EXIST', password);
      const wrong = await loginStudent(app, student.rollNumber, 'WrongPassword1!');

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.error.message).toBe('Invalid roll number or password.');
      expect(wrong.body.error.message).toBe('Invalid roll number or password.');
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  it('refuses a dropped student even with the correct password', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db, { status: 'DROPPED' });
      const { app } = createTestApp(db);
      const response = await loginStudent(app, student.rollNumber, password);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  it('forces a temporary-password student to change their password first', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db, { mustChangePassword: true });
      const { app } = createTestApp(db);

      const login = await loginStudent(app, student.rollNumber, password);
      expect(login.status).toBe(200);
      expect(login.body.data.user.mustChangePassword).toBe(true);

      const blocked = await request(app)
        .get('/api/student/profile')
        .set('Authorization', bearer(accessToken(login)));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const changed = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', bearer(accessToken(login)))
        .send({ currentPassword: password, newPassword: 'Nttf@Portal2027' });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user.mustChangePassword).toBe(false);

      const profile = await request(app)
        .get('/api/student/profile')
        .set('Authorization', bearer(accessToken(changed)));
      expect(profile.status).toBe(200);

      expect((await loginStudent(app, student.rollNumber, password)).status).toBe(401);
      expect((await loginStudent(app, student.rollNumber, 'Nttf@Portal2027')).status).toBe(200);
    });
  });

  it('validates the current password and forbids reusing it', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.rollNumber, password);

      const wrongCurrent = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', bearer(accessToken(login)))
        .send({ currentPassword: 'WrongPassword1!', newPassword: 'Nttf@Portal2027' });
      expect(wrongCurrent.status).toBe(401);
      expect(wrongCurrent.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      const reuse = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', bearer(accessToken(login)))
        .send({ currentPassword: password, newPassword: password });
      expect(reuse.status).toBe(400);
    });
  });

  it('revokes the session on logout and clears the cookie', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.rollNumber, password);
      const cookie = refreshCookie(login);

      const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
      expect(logout.status).toBe(204);
      expect(logout.headers['set-cookie']?.[0]).toContain('nttf_refresh=;');

      const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(refresh.status).toBe(401);
    });
  });

  it('accepts an idempotent logout without a refresh cookie', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app } = createTestApp(db);
      await expect(request(app).post('/api/auth/logout')).resolves.toMatchObject({ status: 204 });
      await expect(request(app).post('/api/auth/refresh')).resolves.toMatchObject({ status: 401 });
    });
  });

  it('rejects malformed and expired refresh cookies', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app, config } = createTestApp(db);

      const malformed = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `${config.cookie.name}=not-a-jwt`);
      expect(malformed.status).toBe(401);
      expect(malformed.body.error.code).toBe('INVALID_TOKEN');

      const expired = jwt.sign(
        { sub: randomUUID(), sid: randomUUID(), role: 'STUDENT', type: 'refresh' },
        config.jwtRefreshSecret,
        {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          jwtid: randomUUID(),
          expiresIn: -60,
        },
      );
      const stale = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `${config.cookie.name}=${expired}`);
      expect(stale.status).toBe(401);
      expect(stale.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  it('revokes a refresh session whose token subject does not match the stored session', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student } = await seedStudent(db);
      const { app, config } = createTestApp(db);

      const sessionId = randomUUID();
      const token = jwt.sign(
        { sub: randomUUID(), sid: sessionId, role: 'STUDENT', type: 'refresh' },
        config.jwtRefreshSecret,
        {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          jwtid: randomUUID(),
          expiresIn: '1h',
        },
      );
      await db.insert(authSessions).values({
        sessionId,
        studentId: student.studentId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `${config.cookie.name}=${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('REFRESH_REUSE');
    });
  });

  it('invalidates password changes for dropped students and reused passwords', async () => {
    await withTestTransaction(pool, async (db) => {
      const dropped = await seedStudent(db, { status: 'DROPPED' });
      const active = await seedStudent(db);
      const service = new AuthService(db, createTestConfig());

      await expect(
        service.changePassword(
          {
            id: dropped.student.studentId,
            role: 'STUDENT',
            name: dropped.student.fullName,
            email: dropped.student.email,
          },
          dropped.password,
          'Nttf@Portal2027',
          {},
        ),
      ).rejects.toMatchObject({ status: 401, code: 'INVALID_SESSION' });

      await expect(
        service.changePassword(
          {
            id: active.student.studentId,
            role: 'STUDENT',
            name: active.student.fullName,
            email: active.student.email,
          },
          active.password,
          active.password,
          {},
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  it('rejects malformed, expired, and forged access tokens', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app, config } = createTestApp(db);

      await expect(request(app).get('/api/auth/me')).resolves.toMatchObject({ status: 401 });
      await expect(
        request(app).get('/api/auth/me').set('Authorization', 'Basic abc'),
      ).resolves.toMatchObject({ status: 401 });
      await expect(
        request(app).get('/api/auth/me').set('Authorization', bearer('not.a.jwt')),
      ).resolves.toMatchObject({
        status: 401,
        body: { error: { code: 'INVALID_TOKEN' } },
      });

      const expired = signAccessToken(
        { sub: randomUUID(), sid: randomUUID(), role: 'STUDENT', type: 'access' },
        config.jwtSecret,
        '-1s',
      );
      await expect(
        request(app).get('/api/auth/me').set('Authorization', bearer(expired)),
      ).resolves.toMatchObject({ status: 401, body: { error: { code: 'TOKEN_EXPIRED' } } });
    });
  });

  it('rate-limits repeated authentication attempts', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db, {
        config: createTestConfig({ authRateLimitMax: 1 }),
      });
      const first = await loginStudent(app, student.rollNumber, password);
      expect(first.status).toBe(200);
      const second = await loginStudent(app, student.rollNumber, password);
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('RATE_LIMITED');
    });
  });
});

describe('administrator authentication and role boundaries', () => {
  it('signs in active staff and exposes their authoritative role', async () => {
    await withTestTransaction(pool, async (db) => {
      const { admin, password } = await seedAdmin(db, {
        role: 'HOD',
        name: 'Head of Department',
      });
      const { app } = createTestApp(db);

      const login = await loginAdmin(app, admin.email.toUpperCase(), password);
      expect(login.status).toBe(200);
      expect(login.body.data.user).toMatchObject({
        id: admin.adminId,
        role: 'HOD',
        name: 'Head of Department',
        email: admin.email,
      });

      const stats = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', bearer(accessToken(login)));
      expect(stats.status).toBe(200);
      expect(stats.body.data).toHaveProperty('byStatus');
    });
  });

  it('rotates an administrator refresh session and refuses it after deactivation', async () => {
    await withTestTransaction(pool, async (db) => {
      const { admin, password } = await seedAdmin(db, { role: 'HOD' });
      const { app } = createTestApp(db);

      const login = await loginAdmin(app, admin.email, password);
      const rotated = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(login));
      expect(rotated.status).toBe(200);
      expect(rotated.body.data.user.role).toBe('HOD');

      await db
        .update(adminUsers)
        .set({ isActive: false })
        .where(eq(adminUsers.adminId, admin.adminId));

      const rejected = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(rotated));
      expect(rejected.status).toBe(401);
      expect(rejected.body.error.code).toBe('INVALID_SESSION');
    });
  });

  it('lets staff change their own password and invalidates the old credentials', async () => {
    await withTestTransaction(pool, async (db) => {
      const { admin, password } = await seedAdmin(db, { role: 'CLERK' });
      const { app } = createTestApp(db);
      const login = await loginAdmin(app, admin.email, password);

      const changed = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', bearer(accessToken(login)))
        .send({ currentPassword: password, newPassword: 'Nttf@Staff2027' });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user.mustChangePassword).toBe(false);

      expect((await loginAdmin(app, admin.email, password)).status).toBe(401);
      expect((await loginAdmin(app, admin.email, 'Nttf@Staff2027')).status).toBe(200);
    });
  });

  it('refuses inactive staff and wrong passwords generically', async () => {
    await withTestTransaction(pool, async (db) => {
      const { admin, password } = await seedAdmin(db, { isActive: false });
      const { app } = createTestApp(db);

      expect((await loginAdmin(app, admin.email, password)).status).toBe(401);
      expect((await loginAdmin(app, admin.email, 'WrongPassword1!')).status).toBe(401);
    });
  });

  it('prevents a student access token from reaching administrator routes', async () => {
    await withTestTransaction(pool, async (db) => {
      const { student, password } = await seedStudent(db);
      const { app } = createTestApp(db);
      const login = await loginStudent(app, student.rollNumber, password);

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', bearer(accessToken(login)));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  it('binds an access token to its database principal', async () => {
    await withTestTransaction(pool, async (db) => {
      const { app, config } = createTestApp(db);

      // A token signed with a valid signature but an unknown subject must not be accepted.
      const forged = signAccessToken(
        { sub: randomUUID(), sid: randomUUID(), role: 'SUPER_ADMIN', type: 'access' },
        config.jwtSecret,
        '15m',
      );
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', bearer(forged));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_SESSION');
    });
  });
});
