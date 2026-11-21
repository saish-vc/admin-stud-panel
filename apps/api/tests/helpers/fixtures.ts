import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AppDb } from '../../src/db/client.js';
import {
  adminUsers,
  auditLogs,
  certificateRequests,
  certificates,
  studentCredentials,
  students,
  type AdminRole,
  type CertificateRequest,
  type CertificateType,
  type RequestStatus,
  type StudentStatus,
} from '../../src/db/schema.js';
import type { PdfGenerator } from '../../src/services/admin.service.js';

let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${randomUUID().replace(/-/g, '').slice(0, 8)}${sequence}`;
}

export interface SeededStudent {
  student: typeof students.$inferSelect;
  password: string;
}

export async function seedStudent(
  db: AppDb,
  options: {
    rollNumber?: string;
    fullName?: string;
    password?: string;
    mustChangePassword?: boolean;
    status?: StudentStatus;
    programme?: string;
    batchYear?: number;
    currentSemester?: number | null;
  } = {},
): Promise<SeededStudent> {
  const suffix = uniqueSuffix();
  const password = options.password ?? 'Student@Test2026';
  const [student] = await db
    .insert(students)
    .values({
      rollNumber: options.rollNumber ?? `TST${suffix.toUpperCase()}`,
      fullName: options.fullName ?? `Test Student ${suffix}`,
      dateOfBirth: '2003-04-15',
      email: `student-${suffix}@students.test`,
      phone: '9876543210',
      programme: options.programme ?? 'Diploma in Computer Engineering',
      batchYear: options.batchYear ?? 2024,
      currentSemester: options.currentSemester === undefined ? 4 : options.currentSemester,
      status: options.status ?? 'ACTIVE',
    })
    .returning();
  if (!student) throw new Error('Could not seed a student');

  await db.insert(studentCredentials).values({
    studentId: student.studentId,
    passwordHash: await bcrypt.hash(password, 4),
    mustChangePassword: options.mustChangePassword ?? false,
  });

  return { student, password };
}

export interface SeededAdmin {
  admin: typeof adminUsers.$inferSelect;
  password: string;
}

export async function seedAdmin(
  db: AppDb,
  options: {
    role?: AdminRole;
    email?: string;
    password?: string;
    name?: string;
    isActive?: boolean;
    mustChangePassword?: boolean;
  } = {},
): Promise<SeededAdmin> {
  const suffix = uniqueSuffix();
  const password = options.password ?? 'Staff@Test2026';
  const [admin] = await db
    .insert(adminUsers)
    .values({
      name: options.name ?? `Test ${options.role ?? 'CLERK'} ${suffix}`,
      email: options.email ?? `staff-${suffix}@nttf.test`,
      passwordHash: await bcrypt.hash(password, 4),
      role: options.role ?? 'CLERK',
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
    })
    .returning();
  if (!admin) throw new Error('Could not seed an admin');
  return { admin, password };
}

export async function seedRequest(
  db: AppDb,
  options: {
    studentId: string;
    status?: RequestStatus;
    certificateType?: CertificateType;
    purpose?: string;
    documentKey?: string;
    adminRemarks?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    createdAt?: Date;
  },
): Promise<CertificateRequest> {
  const suffix = uniqueSuffix();
  const [request] = await db
    .insert(certificateRequests)
    .values({
      studentId: options.studentId,
      certificateType: options.certificateType ?? 'BONAFIDE',
      purpose:
        options.purpose ?? `Integration test request ${suffix}: education loan verification.`,
      status: options.status ?? 'SUBMITTED',
      supportingDocUrl: options.documentKey ?? null,
      adminRemarks: options.adminRemarks ?? null,
      verifiedBy: options.verifiedBy ?? null,
      verifiedAt: options.verifiedAt ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning();
  if (!request) throw new Error('Could not seed a certificate request');
  return request;
}

export async function seedCertificate(
  db: AppDb,
  options: {
    requestId: string;
    generatedBy?: string;
    certificateNumber?: string;
    verificationCode?: string;
    objectKey?: string;
  },
): Promise<typeof certificates.$inferSelect> {
  const suffix = uniqueSuffix();
  const [certificate] = await db
    .insert(certificates)
    .values({
      requestId: options.requestId,
      certificateNumber: options.certificateNumber ?? `NTTF/TEST/${suffix}`,
      verificationCode: options.verificationCode ?? `NTTF-TEST-${suffix.toUpperCase()}`,
      objectKey: options.objectKey ?? `certificates/${suffix}.pdf`,
      sha256: 'a'.repeat(64),
      generatedBy: options.generatedBy ?? null,
    })
    .returning();
  if (!certificate) throw new Error('Could not seed a certificate');
  return certificate;
}

export async function seedAudit(
  db: AppDb,
  options: {
    requestId: string;
    actorRole?: 'STUDENT' | AdminRole;
    actorId?: string;
    actorStudentId?: string;
    action?:
      | 'SUBMITTED'
      | 'VERIFIED_DOCS'
      | 'APPROVED'
      | 'REJECTED'
      | 'GENERATED_PDF'
      | 'GENERATION_FAILED';
    fromStatus?: RequestStatus | null;
    statusAfter?: RequestStatus;
    remarks?: string;
  },
): Promise<void> {
  const actorRole = options.actorRole ?? 'STUDENT';
  await db.insert(auditLogs).values({
    requestId: options.requestId,
    actorRole,
    actorId: actorRole === 'STUDENT' ? null : (options.actorId ?? null),
    actorStudentId: actorRole === 'STUDENT' ? (options.actorStudentId ?? null) : null,
    action: options.action ?? 'SUBMITTED',
    fromStatus: options.fromStatus ?? null,
    statusAfter: options.statusAfter ?? 'SUBMITTED',
    remarks: options.remarks ?? null,
  });
}

export function stubPdfGenerator(
  buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
): PdfGenerator {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return async () => ({ buffer, sha256 });
}

/** Returns a generator that always fails; includes optional call counting. */
export function failingPdfGenerator(): { generate: PdfGenerator; attempts: () => number } {
  let attempts = 0;
  return {
    generate: async () => {
      attempts += 1;
      throw new Error('Simulated PDF renderer failure');
    },
    attempts: () => attempts,
  };
}
