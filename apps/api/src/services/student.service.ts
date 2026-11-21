import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client.js';
import {
  certificateRequests,
  certificates,
  students,
  type Certificate,
  type CertificateRequest,
  type CertificateType,
  type RequestStatus,
} from '../db/schema.js';
import { appendAudit, getTimelines, type TimelineEntry } from '../lib/audit.js';
import { errors } from '../lib/errors.js';
import { canTransition } from './workflow.js';

export const OPEN_REQUEST_STATUSES = ['SUBMITTED', 'UNDER_VERIFICATION'] as const;
export const MAX_OPEN_REQUESTS = 3;

export interface CertificateView {
  certificateNumber: string;
  verificationCode: string;
  generatedAt: string;
  downloadUrl: string;
}

export interface StudentRequestView {
  requestId: string;
  certificateType: CertificateType;
  purpose: string;
  status: string;
  adminRemarks: string | null;
  supportingDocument: boolean;
  verifiedAt: string | null;
  createdAt: string;
  certificate: CertificateView | null;
  timeline: TimelineEntry[];
}

export interface StudentRequestList {
  items: StudentRequestView[];
  page: number;
  limit: number;
  total: number;
}

interface CertificateJoin {
  certificateNumber: string | null;
  verificationCode: string | null;
  generatedAt: Date | null;
}

interface RequestJoinRow {
  request: CertificateRequest;
  certificate: CertificateJoin | null;
}

export function mapCertificateView(certificate: Certificate): CertificateView {
  return {
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    generatedAt: certificate.generatedAt.toISOString(),
    downloadUrl: `/api/student/requests/${certificate.requestId}/certificate`,
  };
}

function mapCertificateJoin(row: RequestJoinRow): CertificateView | null {
  if (
    !row.certificate?.certificateNumber ||
    !row.certificate.verificationCode ||
    !row.certificate.generatedAt
  ) {
    return null;
  }
  return {
    certificateNumber: row.certificate.certificateNumber,
    verificationCode: row.certificate.verificationCode,
    generatedAt: row.certificate.generatedAt.toISOString(),
    downloadUrl: `/api/student/requests/${row.request.requestId}/certificate`,
  };
}

export function mapStudentRequest(
  row: RequestJoinRow,
  timeline: TimelineEntry[] = [],
): StudentRequestView {
  return {
    requestId: row.request.requestId,
    certificateType: row.request.certificateType as CertificateType,
    purpose: row.request.purpose,
    status: row.request.status,
    adminRemarks: row.request.adminRemarks,
    supportingDocument: Boolean(row.request.supportingDocUrl),
    verifiedAt: row.request.verifiedAt?.toISOString() ?? null,
    createdAt: row.request.createdAt.toISOString(),
    certificate: mapCertificateJoin(row),
    timeline,
  };
}

const certificateSelection = {
  certificateNumber: certificates.certificateNumber,
  verificationCode: certificates.verificationCode,
  generatedAt: certificates.generatedAt,
};

async function getStudentProfileRow(db: AppDb, studentId: string) {
  const [row] = await db.select().from(students).where(eq(students.studentId, studentId)).limit(1);
  if (!row) throw errors.notFound('Student record not found.');
  return row;
}

async function getOwnedRequestRow(
  db: AppDb,
  studentId: string,
  requestId: string,
): Promise<RequestJoinRow> {
  const [row] = await db
    .select({ request: certificateRequests, certificate: certificateSelection })
    .from(certificateRequests)
    .leftJoin(certificates, eq(certificates.requestId, certificateRequests.requestId))
    .where(
      and(
        eq(certificateRequests.requestId, requestId),
        eq(certificateRequests.studentId, studentId),
      ),
    )
    .limit(1);
  if (!row) throw errors.notFound();
  return row;
}

export class StudentService {
  constructor(private readonly db: AppDb) {}

  async profile(studentId: string) {
    const row = await getStudentProfileRow(this.db, studentId);
    return {
      studentId: row.studentId,
      rollNumber: row.rollNumber,
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth,
      email: row.email,
      phone: row.phone,
      programme: row.programme,
      batchYear: row.batchYear,
      currentSemester: row.currentSemester,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listRequests(studentId: string, page: number, limit: number): Promise<StudentRequestList> {
    const offset = (page - 1) * limit;
    const [totalRow] = await this.db
      .select({ value: count() })
      .from(certificateRequests)
      .where(eq(certificateRequests.studentId, studentId));

    const rows = await this.db
      .select({ request: certificateRequests, certificate: certificateSelection })
      .from(certificateRequests)
      .leftJoin(certificates, eq(certificates.requestId, certificateRequests.requestId))
      .where(eq(certificateRequests.studentId, studentId))
      .orderBy(desc(certificateRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const timelines = await getTimelines(
      this.db,
      rows.map((row) => row.request.requestId),
    );
    return {
      items: rows.map((row) => mapStudentRequest(row, timelines.get(row.request.requestId) ?? [])),
      page,
      limit,
      total: totalRow?.value ?? 0,
    };
  }

  async getRequest(studentId: string, requestId: string): Promise<StudentRequestView> {
    const row = await getOwnedRequestRow(this.db, studentId, requestId);
    const timelines = await getTimelines(this.db, [requestId]);
    return mapStudentRequest(row, timelines.get(requestId) ?? []);
  }

  async createRequest(
    studentId: string,
    input: { certificateType: CertificateType; purpose: string; documentKey?: string },
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studentId})::bigint)`);
      const [open] = await tx
        .select({ value: count() })
        .from(certificateRequests)
        .where(
          and(
            eq(certificateRequests.studentId, studentId),
            inArray(certificateRequests.status, [...OPEN_REQUEST_STATUSES]),
          ),
        );
      if ((open?.value ?? 0) >= MAX_OPEN_REQUESTS) {
        throw errors.conflict(
          `You can have at most ${MAX_OPEN_REQUESTS} open certificate requests.`,
          'OPEN_REQUEST_LIMIT',
        );
      }

      const [inserted] = await tx
        .insert(certificateRequests)
        .values({
          studentId,
          certificateType: input.certificateType,
          purpose: input.purpose,
          supportingDocUrl: input.documentKey ?? null,
          status: 'SUBMITTED',
        })
        .returning({ requestId: certificateRequests.requestId });
      if (!inserted) throw errors.internal('Could not create the request.');

      await appendAudit(tx, {
        requestId: inserted.requestId,
        actor: { role: 'STUDENT', studentId },
        action: 'SUBMITTED',
        fromStatus: null,
        statusAfter: 'SUBMITTED',
        remarks: null,
      });
      return inserted.requestId;
    });
  }

  async resubmit(
    studentId: string,
    requestId: string,
    input: { purpose: string; documentKey?: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studentId})::bigint)`);
      const [request] = await tx
        .select()
        .from(certificateRequests)
        .where(
          and(
            eq(certificateRequests.requestId, requestId),
            eq(certificateRequests.studentId, studentId),
          ),
        )
        .for('update')
        .limit(1);
      if (!request) throw errors.notFound();
      if (!canTransition(request.status as RequestStatus, 'SUBMITTED', 'STUDENT')) {
        throw errors.conflict(
          'Only rejected requests can be resubmitted.',
          'INVALID_STATE_TRANSITION',
        );
      }

      const [open] = await tx
        .select({ value: count() })
        .from(certificateRequests)
        .where(
          and(
            eq(certificateRequests.studentId, studentId),
            inArray(certificateRequests.status, [...OPEN_REQUEST_STATUSES]),
          ),
        );
      if ((open?.value ?? 0) >= MAX_OPEN_REQUESTS) {
        throw errors.conflict(
          `You can have at most ${MAX_OPEN_REQUESTS} open certificate requests.`,
          'OPEN_REQUEST_LIMIT',
        );
      }

      await tx
        .update(certificateRequests)
        .set({
          purpose: input.purpose,
          ...(input.documentKey ? { supportingDocUrl: input.documentKey } : {}),
          status: 'SUBMITTED',
          adminRemarks: null,
          verifiedBy: null,
          verifiedAt: null,
        })
        .where(eq(certificateRequests.requestId, requestId));

      await appendAudit(tx, {
        requestId,
        actor: { role: 'STUDENT', studentId },
        action: 'SUBMITTED',
        fromStatus: 'REJECTED',
        statusAfter: 'SUBMITTED',
        remarks: null,
      });
    });
  }

  async getDocumentObject(
    studentId: string,
    requestId: string,
  ): Promise<{ key: string; rollNumber: string }> {
    const [row] = await this.db
      .select({
        documentKey: certificateRequests.supportingDocUrl,
        rollNumber: students.rollNumber,
      })
      .from(certificateRequests)
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(
        and(
          eq(certificateRequests.requestId, requestId),
          eq(certificateRequests.studentId, studentId),
        ),
      )
      .limit(1);
    if (!row?.documentKey) throw errors.notFound('No supporting document is available.');
    return { key: row.documentKey, rollNumber: row.rollNumber };
  }

  async getCertificateObject(
    studentId: string,
    requestId: string,
  ): Promise<{ key: string; rollNumber: string; certificateNumber: string }> {
    const [row] = await this.db
      .select({
        objectKey: certificates.objectKey,
        rollNumber: students.rollNumber,
        certificateNumber: certificates.certificateNumber,
      })
      .from(certificateRequests)
      .innerJoin(certificates, eq(certificates.requestId, certificateRequests.requestId))
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(
        and(
          eq(certificateRequests.requestId, requestId),
          eq(certificateRequests.studentId, studentId),
          eq(certificateRequests.status, 'READY'),
        ),
      )
      .limit(1);
    if (!row) throw errors.notFound('The certificate is not ready yet.');
    return {
      key: row.objectKey,
      rollNumber: row.rollNumber,
      certificateNumber: row.certificateNumber,
    };
  }

  async getVerification(studentId: string, requestId: string) {
    const [row] = await this.db
      .select({
        certificateNumber: certificates.certificateNumber,
        verificationCode: certificates.verificationCode,
        generatedAt: certificates.generatedAt,
        status: certificateRequests.status,
      })
      .from(certificateRequests)
      .innerJoin(certificates, eq(certificates.requestId, certificateRequests.requestId))
      .where(
        and(
          eq(certificateRequests.requestId, requestId),
          eq(certificateRequests.studentId, studentId),
        ),
      )
      .limit(1);
    if (!row) throw errors.notFound('Certificate information was not found.');
    return {
      certificateNumber: row.certificateNumber,
      verificationCode: row.verificationCode,
      verificationPath: `/verify/${row.verificationCode}`,
      generatedAt: row.generatedAt.toISOString(),
      status: row.status,
    };
  }
}
