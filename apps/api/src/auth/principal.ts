import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { adminUsers, studentCredentials, students } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import type { AccessTokenPayload } from '../lib/jwt.js';

/**
 * Load the current principal from PostgreSQL for every request. JWT role/subject claims
 * identify the candidate row, but the authoritative role and active flags come from the DB.
 */
export async function loadPrincipal(
  db: DbExecutor,
  payload: AccessTokenPayload,
): Promise<{
  id: string;
  role: 'STUDENT' | 'CLERK' | 'HOD' | 'SUPER_ADMIN';
  name: string;
  email: string;
  mustChangePassword: boolean;
  sessionId: string;
  rollNumber?: string;
  programme?: string;
}> {
  if (payload.role === 'STUDENT') {
    const [row] = await db
      .select({
        id: students.studentId,
        name: students.fullName,
        email: students.email,
        rollNumber: students.rollNumber,
        programme: students.programme,
        status: students.status,
        mustChangePassword: studentCredentials.mustChangePassword,
      })
      .from(students)
      .innerJoin(studentCredentials, eq(studentCredentials.studentId, students.studentId))
      .where(eq(students.studentId, payload.sub))
      .limit(1);

    if (!row || row.status === 'DROPPED') {
      throw errors.unauthorized('Your session is no longer valid.', 'INVALID_SESSION');
    }
    return {
      id: row.id,
      role: 'STUDENT',
      name: row.name,
      email: row.email,
      mustChangePassword: row.mustChangePassword,
      sessionId: payload.sid,
      rollNumber: row.rollNumber,
      programme: row.programme,
    };
  }

  const [row] = await db
    .select({
      id: adminUsers.adminId,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
      mustChangePassword: adminUsers.mustChangePassword,
    })
    .from(adminUsers)
    .where(eq(adminUsers.adminId, payload.sub))
    .limit(1);

  if (!row || !row.isActive) {
    throw errors.unauthorized('Your session is no longer valid.', 'INVALID_SESSION');
  }

  return {
    id: row.id,
    role: row.role as 'CLERK' | 'HOD' | 'SUPER_ADMIN',
    name: row.name,
    email: row.email,
    mustChangePassword: row.mustChangePassword,
    sessionId: payload.sid,
  };
}

export async function findActiveAdminByEmail(
  db: DbExecutor,
  email: string,
): Promise<typeof adminUsers.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email), eq(adminUsers.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function findStudentForLogin(
  db: DbExecutor,
  rollNumber: string,
): Promise<{
  student: typeof students.$inferSelect;
  credential: typeof studentCredentials.$inferSelect;
} | null> {
  const [row] = await db
    .select({ student: students, credential: studentCredentials })
    .from(students)
    .innerJoin(studentCredentials, eq(studentCredentials.studentId, students.studentId))
    .where(eq(students.rollNumber, rollNumber))
    .limit(1);

  if (!row || row.student.status === 'DROPPED') return null;
  return row;
}
