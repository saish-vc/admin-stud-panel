import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import bcrypt from 'bcrypt';
import { createDb, createPool } from '../src/db/client.js';
import {
  adminUsers,
  auditLogs,
  certificateRequests,
  certificates,
  studentCredentials,
  students,
} from '../src/db/schema.js';

loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'NttfE2E!2026';

const STUDENTS = [
  {
    rollNumber: 'NTTF2026001',
    fullName: 'Ananya Menon',
    dateOfBirth: '2003-04-15',
    email: 'ananya.menon@students.nttf.ac.in',
    phone: '9876543210',
    programme: 'Diploma in Mechanical Engineering',
    batchYear: 2023,
    currentSemester: 6,
    status: 'ACTIVE',
    password: 'Student@E2E2026',
    mustChange: false,
  },
  {
    rollNumber: 'NTTF2026002',
    fullName: 'Rahul Iyer',
    dateOfBirth: '2002-12-09',
    email: 'rahul.iyer@students.nttf.ac.in',
    phone: '9867012345',
    programme: 'Diploma in Information Technology',
    batchYear: 2023,
    currentSemester: 6,
    status: 'ACTIVE',
    password: '09122002',
    mustChange: true,
  },
  {
    rollNumber: 'NTTF2026003',
    fullName: 'Sara Thomas',
    dateOfBirth: '2004-08-21',
    email: 'sara.thomas@students.nttf.ac.in',
    phone: '9765012345',
    programme: 'Diploma in Electronics & Communication Engineering',
    batchYear: 2024,
    currentSemester: 4,
    status: 'ACTIVE',
    password: 'Student@E2E2026',
    mustChange: false,
  },
] as const;

const STAFF = [
  { name: 'E2E Verification Clerk', email: 'clerk@nttf.ac.in', role: 'CLERK' as const },
  { name: 'E2E Head of Department', email: 'hod@nttf.ac.in', role: 'HOD' as const },
  { name: 'E2E Super Administrator', email: 'superadmin@nttf.ac.in', role: 'SUPER_ADMIN' as const },
];

function databaseName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('seed-e2e requires NODE_ENV=test');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  if (!databaseName(process.env.DATABASE_URL).endsWith('_test')) {
    throw new Error('Refusing to reset a database whose name does not end in _test');
  }

  const pool = createPool(process.env.DATABASE_URL);
  const db = createDb(pool);
  const cost = Number(process.env.BCRYPT_COST ?? 12);

  try {
    // TRUNCATE does not fire the row-level audit immutability trigger. Guarded above to test DB only.
    await db.execute(
      'TRUNCATE TABLE audit_logs, certificates, certificate_requests, auth_sessions, student_credentials, students, admin_users RESTART IDENTITY CASCADE',
    );

    const adminHash = await bcrypt.hash(E2E_ADMIN_PASSWORD, cost);
    const staffRows = await db
      .insert(adminUsers)
      .values(
        STAFF.map((staff) => ({
          name: staff.name,
          email: staff.email,
          passwordHash: adminHash,
          role: staff.role,
          isActive: true,
          mustChangePassword: false,
        })),
      )
      .returning({ adminId: adminUsers.adminId, role: adminUsers.role });
    const clerkId = staffRows.find((row) => row.role === 'CLERK')?.adminId;
    const hodId = staffRows.find((row) => row.role === 'HOD')?.adminId;
    if (!clerkId || !hodId) throw new Error('Could not resolve staff fixtures');

    const studentIds = new Map<string, string>();
    for (const student of STUDENTS) {
      const [inserted] = await db
        .insert(students)
        .values({
          rollNumber: student.rollNumber,
          fullName: student.fullName,
          dateOfBirth: student.dateOfBirth,
          email: student.email,
          phone: student.phone,
          programme: student.programme,
          batchYear: student.batchYear,
          currentSemester: student.currentSemester,
          status: student.status,
        })
        .returning({ studentId: students.studentId });
      if (!inserted) throw new Error(`Could not insert ${student.rollNumber}`);

      await db.insert(studentCredentials).values({
        studentId: inserted.studentId,
        passwordHash: await bcrypt.hash(student.password, cost),
        mustChangePassword: student.mustChange,
      });
      studentIds.set(student.rollNumber, inserted.studentId);
    }

    const readyStudentId = studentIds.get('NTTF2026003');
    if (!readyStudentId) throw new Error('Could not resolve the READY fixture student');

    const [readyRequest] = await db
      .insert(certificateRequests)
      .values({
        studentId: readyStudentId,
        certificateType: 'BONAFIDE',
        purpose: 'Verification fixture for a completed certificate request.',
        status: 'READY',
        verifiedBy: clerkId,
        verifiedAt: new Date('2026-02-02T09:15:00.000Z'),
      })
      .returning({ requestId: certificateRequests.requestId });
    if (!readyRequest) throw new Error('Could not insert the READY request fixture');

    await db.insert(auditLogs).values([
      {
        requestId: readyRequest.requestId,
        actorStudentId: readyStudentId,
        actorRole: 'STUDENT',
        action: 'SUBMITTED',
        fromStatus: null,
        statusAfter: 'SUBMITTED',
        timestamp: new Date('2026-02-01T10:00:00.000Z'),
      },
      {
        requestId: readyRequest.requestId,
        actorId: clerkId,
        actorRole: 'CLERK',
        action: 'VERIFIED_DOCS',
        fromStatus: 'SUBMITTED',
        statusAfter: 'UNDER_VERIFICATION',
        timestamp: new Date('2026-02-02T09:15:00.000Z'),
      },
      {
        requestId: readyRequest.requestId,
        actorId: hodId,
        actorRole: 'HOD',
        action: 'APPROVED',
        fromStatus: 'UNDER_VERIFICATION',
        statusAfter: 'APPROVED',
        timestamp: new Date('2026-02-02T11:30:00.000Z'),
      },
      {
        requestId: readyRequest.requestId,
        actorId: hodId,
        actorRole: 'HOD',
        action: 'GENERATED_PDF',
        fromStatus: 'APPROVED',
        statusAfter: 'READY',
        timestamp: new Date('2026-02-02T11:31:00.000Z'),
      },
    ]);

    await db.insert(certificates).values({
      requestId: readyRequest.requestId,
      certificateNumber: 'NTTF/2026/E2E/0001',
      verificationCode: 'NTTF-VERIFY-E2E-2026-0001',
      objectKey: 'certificates/e2e-verification-fixture.pdf',
      sha256: 'a'.repeat(64),
      generatedBy: hodId,
      generatedAt: new Date('2026-02-02T11:31:00.000Z'),
    });

    console.info('[db:seed:e2e] complete', {
      students: STUDENTS.length,
      staff: STAFF.length,
      adminPassword: 'E2E_ADMIN_PASSWORD',
      primaryStudent: STUDENTS[0].rollNumber,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed:e2e] failed', error);
  process.exitCode = 1;
});
