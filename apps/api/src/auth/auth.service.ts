import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import type { AppDb, DbExecutor } from '../db/client.js';
import {
  adminUsers,
  authSessions,
  studentCredentials,
  students,
  type PrincipalRole,
} from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { safeEqual, sha256 } from '../lib/crypto.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type RefreshTokenPayload,
} from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { findActiveAdminByEmail, findStudentForLogin, loadPrincipal } from './principal.js';
import type { AuthTokens, AuthUser, LoginMeta } from './types.js';

// Valid bcrypt cost-12 hash used only to equalise timing when an account does not exist.
const DUMMY_BCRYPT_HASH = '$2b$12$YuQq33sS/y7.L7CjfnQETOpAj.R5R3pBieXAY2MFKLi6iSqSZmPQm';

interface RawActor {
  id: string;
  role: PrincipalRole;
  name: string;
  email: string;
  mustChangePassword: boolean;
  credentialHash: string;
  rollNumber?: string;
  programme?: string;
  studentStatus?: string;
  isActive?: boolean;
}

function actorToUser(actor: RawActor): AuthUser {
  return {
    id: actor.id,
    role: actor.role,
    name: actor.name,
    email: actor.email,
    mustChangePassword: actor.mustChangePassword,
    ...(actor.rollNumber ? { rollNumber: actor.rollNumber } : {}),
    ...(actor.programme ? { programme: actor.programme } : {}),
  };
}

function ttlDaysToDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export class AuthService {
  constructor(
    private readonly db: AppDb,
    private readonly config: AppConfig,
  ) {}

  private async issueForActor(
    db: DbExecutor,
    actor: RawActor,
    meta: LoginMeta,
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const accessToken = signAccessToken(
      { sub: actor.id, sid: sessionId, role: actor.role, type: 'access' },
      this.config.jwtSecret,
      this.config.accessTokenTtl,
    );
    const refreshToken = signRefreshToken(
      {
        sub: actor.id,
        sid: sessionId,
        role: actor.role,
        type: 'refresh',
        jti: randomUUID(),
      },
      this.config.jwtRefreshSecret,
      this.config.refreshTokenTtlDays,
    );
    const refreshExpiresAt = ttlDaysToDate(this.config.refreshTokenTtlDays);

    await db.insert(authSessions).values({
      sessionId,
      studentId: actor.role === 'STUDENT' ? actor.id : null,
      adminId: actor.role === 'STUDENT' ? null : actor.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 1000) ?? null,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: actorToUser(actor),
    };
  }

  async loginStudent(rollNumber: string, password: string, meta: LoginMeta): Promise<AuthTokens> {
    const match = await findStudentForLogin(this.db, rollNumber);
    const hash = match?.credential.passwordHash ?? DUMMY_BCRYPT_HASH;
    const passwordValid = await verifyPassword(password, hash);

    if (!match || !passwordValid) {
      throw errors.unauthorized('Invalid roll number or password.', 'INVALID_CREDENTIALS');
    }
    if (match.student.status === 'DROPPED') {
      throw errors.unauthorized('Invalid roll number or password.', 'INVALID_CREDENTIALS');
    }

    const actor: RawActor = {
      id: match.student.studentId,
      role: 'STUDENT',
      name: match.student.fullName,
      email: match.student.email,
      mustChangePassword: match.credential.mustChangePassword,
      credentialHash: hash,
      rollNumber: match.student.rollNumber,
      programme: match.student.programme,
      studentStatus: match.student.status,
    };

    await this.db
      .update(studentCredentials)
      .set({ lastLoginAt: new Date() })
      .where(eq(studentCredentials.studentId, actor.id));

    return this.issueForActor(this.db, actor, meta);
  }

  async loginAdmin(email: string, password: string, meta: LoginMeta): Promise<AuthTokens> {
    const admin = await findActiveAdminByEmail(this.db, email);
    const hash = admin?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const passwordValid = await verifyPassword(password, hash);

    if (!admin || !passwordValid) {
      throw errors.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const actor: RawActor = {
      id: admin.adminId,
      role: admin.role as 'CLERK' | 'HOD' | 'SUPER_ADMIN',
      name: admin.name,
      email: admin.email,
      mustChangePassword: admin.mustChangePassword,
      credentialHash: hash,
      isActive: admin.isActive,
    };
    return this.issueForActor(this.db, actor, meta);
  }

  async refresh(rawRefreshToken: string, meta: LoginMeta): Promise<AuthTokens> {
    let claims: RefreshTokenPayload & { jti: string };
    try {
      claims = verifyRefreshToken(rawRefreshToken, this.config.jwtRefreshSecret);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TokenExpiredError') {
        throw errors.unauthorized(
          'Your session has expired. Please sign in again.',
          'TOKEN_EXPIRED',
        );
      }
      throw errors.unauthorized('Your session is invalid. Please sign in again.', 'INVALID_TOKEN');
    }

    const outcome = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(authSessions)
        .where(eq(authSessions.sessionId, claims.sid))
        .for('update')
        .limit(1);

      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
        return { kind: 'invalid' as const };
      }

      const submittedHash = sha256(rawRefreshToken);
      if (!safeEqual(session.tokenHash, submittedHash)) {
        // A validly signed but stale refresh token was replayed. Revoke the session.
        await tx
          .update(authSessions)
          .set({ revokedAt: new Date() })
          .where(eq(authSessions.sessionId, claims.sid));
        return { kind: 'reuse' as const };
      }

      const actorId = session.studentId ?? session.adminId;
      if (!actorId || actorId !== claims.sub) {
        await tx
          .update(authSessions)
          .set({ revokedAt: new Date() })
          .where(eq(authSessions.sessionId, claims.sid));
        return { kind: 'reuse' as const };
      }

      let actor: RawActor;
      try {
        const principal = await loadPrincipal(tx, {
          sub: claims.sub,
          sid: claims.sid,
          role: claims.role,
          type: 'access',
        });
        if (principal.role === 'STUDENT') {
          const [student] = await tx
            .select()
            .from(students)
            .where(eq(students.studentId, principal.id))
            .limit(1);
          if (!student) return { kind: 'invalid' as const };
          actor = {
            id: principal.id,
            role: 'STUDENT',
            name: principal.name,
            email: principal.email,
            mustChangePassword: principal.mustChangePassword,
            credentialHash: '',
            rollNumber: student.rollNumber,
            programme: student.programme,
            studentStatus: student.status,
          };
        } else {
          const [admin] = await tx
            .select()
            .from(adminUsers)
            .where(eq(adminUsers.adminId, principal.id))
            .limit(1);
          if (!admin?.isActive) return { kind: 'invalid' as const };
          actor = {
            id: principal.id,
            role: principal.role,
            name: principal.name,
            email: principal.email,
            mustChangePassword: principal.mustChangePassword,
            credentialHash: '',
          };
        }
      } catch {
        return { kind: 'invalid' as const };
      }

      const newRefreshToken = signRefreshToken(
        {
          sub: actor.id,
          sid: claims.sid,
          role: actor.role,
          type: 'refresh',
          jti: randomUUID(),
        },
        this.config.jwtRefreshSecret,
        this.config.refreshTokenTtlDays,
      );
      const refreshExpiresAt = ttlDaysToDate(this.config.refreshTokenTtlDays);
      const accessToken = signAccessToken(
        { sub: actor.id, sid: claims.sid, role: actor.role, type: 'access' },
        this.config.jwtSecret,
        this.config.accessTokenTtl,
      );

      await tx
        .update(authSessions)
        .set({
          tokenHash: sha256(newRefreshToken),
          rotatedAt: new Date(),
          expiresAt: refreshExpiresAt,
          ipAddress: meta.ipAddress?.slice(0, 64) ?? session.ipAddress,
          userAgent: meta.userAgent?.slice(0, 1000) ?? session.userAgent,
        })
        .where(eq(authSessions.sessionId, claims.sid));

      return {
        kind: 'ok' as const,
        user: actorToUser(actor),
        accessToken,
        refreshToken: newRefreshToken,
        refreshExpiresAt,
      };
    });

    if (outcome.kind !== 'ok') {
      if (outcome.kind === 'reuse') {
        throw errors.unauthorized(
          'This session was already rotated. Please sign in again.',
          'REFRESH_REUSE',
        );
      }
      throw errors.unauthorized(
        'Your session is invalid. Please sign in again.',
        'INVALID_SESSION',
      );
    }
    return {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      refreshExpiresAt: outcome.refreshExpiresAt,
      user: outcome.user,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    try {
      const claims = verifyRefreshToken(rawRefreshToken, this.config.jwtRefreshSecret);
      const [session] = await this.db
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.sessionId, claims.sid),
            isNull(authSessions.revokedAt),
            eq(authSessions.tokenHash, sha256(rawRefreshToken)),
          ),
        )
        .limit(1);
      if (session) {
        await this.db
          .update(authSessions)
          .set({ revokedAt: new Date() })
          .where(eq(authSessions.sessionId, session.sessionId));
      }
    } catch {
      // Logout is intentionally idempotent and never reveals token validity.
    }
  }

  async changePassword(
    principal: { id: string; role: PrincipalRole; name: string; email: string },
    currentPassword: string,
    newPassword: string,
    meta: LoginMeta,
  ): Promise<AuthTokens> {
    return this.db.transaction(async (tx) => {
      let actor: RawActor;

      if (principal.role === 'STUDENT') {
        const [row] = await tx
          .select({ student: students, credential: studentCredentials })
          .from(students)
          .innerJoin(studentCredentials, eq(studentCredentials.studentId, students.studentId))
          .where(eq(students.studentId, principal.id))
          .for('update')
          .limit(1);
        if (!row || row.student.status === 'DROPPED') {
          throw errors.unauthorized('Your session is no longer valid.', 'INVALID_SESSION');
        }
        actor = {
          id: row.student.studentId,
          role: 'STUDENT',
          name: row.student.fullName,
          email: row.student.email,
          mustChangePassword: false,
          credentialHash: row.credential.passwordHash,
          rollNumber: row.student.rollNumber,
          programme: row.student.programme,
        };
      } else {
        const [admin] = await tx
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.adminId, principal.id))
          .for('update')
          .limit(1);
        if (!admin || !admin.isActive) {
          throw errors.unauthorized('Your session is no longer valid.', 'INVALID_SESSION');
        }
        actor = {
          id: admin.adminId,
          role: admin.role as 'CLERK' | 'HOD' | 'SUPER_ADMIN',
          name: admin.name,
          email: admin.email,
          mustChangePassword: false,
          credentialHash: admin.passwordHash,
        };
      }

      const currentValid = await verifyPassword(currentPassword, actor.credentialHash);
      if (!currentValid) {
        throw errors.unauthorized(
          'Your current password is incorrect.',
          'INVALID_CURRENT_PASSWORD',
        );
      }
      if (await verifyPassword(newPassword, actor.credentialHash)) {
        throw errors.badRequest('The new password must differ from the current password.');
      }

      const newHash = await hashPassword(newPassword, this.config.bcryptCost);
      if (principal.role === 'STUDENT') {
        await tx
          .update(studentCredentials)
          .set({
            passwordHash: newHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          })
          .where(eq(studentCredentials.studentId, actor.id));
      } else {
        await tx
          .update(adminUsers)
          .set({ passwordHash: newHash, mustChangePassword: false })
          .where(eq(adminUsers.adminId, actor.id));
      }

      await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            isNull(authSessions.revokedAt),
            or(eq(authSessions.studentId, actor.id), eq(authSessions.adminId, actor.id)),
          ),
        );

      const tokens = await this.issueForActor(tx, actor, meta);
      tokens.user.mustChangePassword = false;
      return tokens;
    });
  }
}
