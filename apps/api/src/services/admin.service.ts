import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import {
  certificateRequests,
  certificates,
  students,
  type CertificateRequest,
  type CertificateType,
  type RequestStatus,
} from '../db/schema.js';
import { appendAudit, getTimelines, type TimelineEntry } from '../lib/audit.js';
import {
  buildCertificateNumber,
  buildVerificationUrl,
  generateCertificatePdf,
  type CertificatePdfData,
  type GeneratedPdf,
} from './certificate-pdf.js';
import { AppError, errors } from '../lib/errors.js';
import { randomCertificateSuffix, randomCode } from '../lib/crypto.js';
import { withRetry } from '../lib/retry.js';
import { certificateObjectKey, type StorageAdapter } from '../lib/storage.js';
import { canTransition } from './workflow.js';

export type PdfGenerator = (data: CertificatePdfData) => Promise<GeneratedPdf>;

export interface AdminCertificateView {
  certificateNumber: string;
  verificationCode: string;
  verificationPath: string;
  generatedAt: string;
  sha256: string;
}

export interface AdminStudentView {
  studentId: string;
  rollNumber: string;
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string | null;
  programme: string;
  batchYear: number;
  currentSemester: number | null;
  status: string;
}

export interface AdminRequestView {
  requestId: string;
  certificateType: CertificateType;
  purpose: string;
  status: string;
  adminRemarks: string | null;
  supportingDocument: boolean;
  verifiedAt: string | null;
  createdAt: string;
  student: AdminStudentView;
  certificate: AdminCertificateView | null;
  timeline: TimelineEntry[];
}

interface AdminRequestRow {
  request: CertificateRequest;
  student: typeof students.$inferSelect;
  certificate: {
    certificateNumber: string | null;
    verificationCode: string | null;
    generatedAt: Date | null;
    sha256: string | null;
  } | null;
}

interface AdminQueueRow {
  requestId: string;
  rollNumber: string;
  studentName: string;
  programme: string;
  batchYear: number;
  certificateType: string;
  status: string;
  purpose: string;
  supportingDocUrl: string | null;
  createdAt: Date;
}

interface IssueSuccess {
  ok: true;
  certificate: AdminCertificateView;
}
interface IssueFailure {
  ok: false;
  reason: string;
}
export type IssueResult = IssueSuccess | IssueFailure;

const adminCertificateSelection = {
  certificateNumber: certificates.certificateNumber,
  verificationCode: certificates.verificationCode,
  generatedAt: certificates.generatedAt,
  sha256: certificates.sha256,
};

function mapAdminCertificate(row: AdminRequestRow): AdminCertificateView | null {
  const certificate = row.certificate;
  if (
    !certificate ||
    !certificate.certificateNumber ||
    !certificate.verificationCode ||
    !certificate.generatedAt ||
    !certificate.sha256
  ) {
    return null;
  }
  return {
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    verificationPath: `/verify/${certificate.verificationCode}`,
    generatedAt: certificate.generatedAt.toISOString(),
    sha256: certificate.sha256,
  };
}

function mapAdminRequest(row: AdminRequestRow, timeline: TimelineEntry[]): AdminRequestView {
  return {
    requestId: row.request.requestId,
    certificateType: row.request.certificateType as CertificateType,
    purpose: row.request.purpose,
    status: row.request.status,
    adminRemarks: row.request.adminRemarks,
    supportingDocument: Boolean(row.request.supportingDocUrl),
    verifiedAt: row.request.verifiedAt?.toISOString() ?? null,
    createdAt: row.request.createdAt.toISOString(),
    student: {
      studentId: row.student.studentId,
      rollNumber: row.student.rollNumber,
      fullName: row.student.fullName,
      dateOfBirth: row.student.dateOfBirth,
      email: row.student.email,
      phone: row.student.phone,
      programme: row.student.programme,
      batchYear: row.student.batchYear,
      currentSemester: row.student.currentSemester,
      status: row.student.status,
    },
    certificate: mapAdminCertificate(row),
    timeline,
  };
}

function safeSearchTerm(query: string | undefined): string | undefined {
  if (!query) return undefined;
  return query.replace(/[%_\\]/g, '').slice(0, 100);
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps driver errors, so the PostgreSQL SQLSTATE sits on the cause chain.
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { code?: string }).code === '23505') return true;
    current = current.cause;
  }
  return false;
}

export interface AdminServiceDeps {
  db: AppDb;
  config: AppConfig;
  storage: StorageAdapter;
  logger: Logger;
  generatePdf?: PdfGenerator;
}

export class AdminService {
  private readonly generatePdf: PdfGenerator;

  constructor(private readonly deps: AdminServiceDeps) {
    this.generatePdf = deps.generatePdf ?? generateCertificatePdf;
  }

  async getStats() {
    const rows = await this.deps.db
      .select({ status: certificateRequests.status, value: count() })
      .from(certificateRequests)
      .groupBy(certificateRequests.status);
    const byStatus: Record<string, number> = {
      SUBMITTED: 0,
      UNDER_VERIFICATION: 0,
      APPROVED: 0,
      REJECTED: 0,
      READY: 0,
    };
    for (const row of rows) byStatus[row.status] = Number(row.value);

    const [issued] = await this.deps.db.select({ value: count() }).from(certificates);
    return {
      byStatus,
      totalRequests: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      totalIssued: Number(issued?.value ?? 0),
      awaitingVerification: byStatus.SUBMITTED ?? 0,
      awaitingApproval: byStatus.UNDER_VERIFICATION ?? 0,
    };
  }

  async listRequests(params: {
    status?: string | undefined;
    type?: string | undefined;
    q?: string | undefined;
    page: number;
    limit: number;
  }) {
    const search = safeSearchTerm(params.q);
    const filters = [
      params.status ? eq(certificateRequests.status, params.status) : undefined,
      params.type ? eq(certificateRequests.certificateType, params.type) : undefined,
      search
        ? or(ilike(students.rollNumber, `%${search}%`), ilike(students.fullName, `%${search}%`))
        : undefined,
    ].filter((value) => value !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;
    const [totalRow] = await this.deps.db
      .select({ value: count() })
      .from(certificateRequests)
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(where);

    const offset = (params.page - 1) * params.limit;
    const rows: AdminQueueRow[] = await this.deps.db
      .select({
        requestId: certificateRequests.requestId,
        rollNumber: students.rollNumber,
        studentName: students.fullName,
        programme: students.programme,
        batchYear: students.batchYear,
        certificateType: certificateRequests.certificateType,
        status: certificateRequests.status,
        purpose: certificateRequests.purpose,
        supportingDocUrl: certificateRequests.supportingDocUrl,
        createdAt: certificateRequests.createdAt,
      })
      .from(certificateRequests)
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(where)
      .orderBy(
        sql`case when ${certificateRequests.status} in ('SUBMITTED', 'UNDER_VERIFICATION') then 0 else 1 end`,
        desc(certificateRequests.createdAt),
      )
      .limit(params.limit)
      .offset(offset);

    return {
      items: rows.map((row) => ({
        requestId: row.requestId,
        rollNumber: row.rollNumber,
        studentName: row.studentName,
        programme: row.programme,
        batchYear: row.batchYear,
        certificateType: row.certificateType as CertificateType,
        status: row.status,
        purpose: row.purpose,
        hasSupportingDocument: Boolean(row.supportingDocUrl),
        createdAt: row.createdAt.toISOString(),
      })),
      page: params.page,
      limit: params.limit,
      total: Number(totalRow?.value ?? 0),
    };
  }

  private async getRow(requestId: string): Promise<AdminRequestRow> {
    const [row] = await this.deps.db
      .select({
        request: certificateRequests,
        student: students,
        certificate: adminCertificateSelection,
      })
      .from(certificateRequests)
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .leftJoin(certificates, eq(certificates.requestId, certificateRequests.requestId))
      .where(eq(certificateRequests.requestId, requestId))
      .limit(1);
    if (!row) throw errors.notFound();
    return row as AdminRequestRow;
  }

  async getRequest(requestId: string): Promise<AdminRequestView> {
    const row = await this.getRow(requestId);
    const timelines = await getTimelines(this.deps.db, [requestId]);
    return mapAdminRequest(row, timelines.get(requestId) ?? []);
  }

  async verify(
    requestId: string,
    adminId: string,
    actorRole: 'CLERK' | 'SUPER_ADMIN',
    remarks: string | undefined,
  ): Promise<AdminRequestView> {
    await this.deps.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(certificateRequests)
        .where(eq(certificateRequests.requestId, requestId))
        .for('update')
        .limit(1);
      if (!request) throw errors.notFound();
      if (!canTransition(request.status as RequestStatus, 'UNDER_VERIFICATION', actorRole)) {
        throw errors.conflict(
          'Only a submitted request can be verified.',
          'INVALID_STATE_TRANSITION',
        );
      }

      await tx
        .update(certificateRequests)
        .set({
          status: 'UNDER_VERIFICATION',
          verifiedBy: adminId,
          verifiedAt: new Date(),
          ...(remarks ? { adminRemarks: remarks } : {}),
        })
        .where(eq(certificateRequests.requestId, requestId));

      await appendAudit(tx, {
        requestId,
        actor: { role: actorRole, adminId },
        action: 'VERIFIED_DOCS',
        fromStatus: 'SUBMITTED',
        statusAfter: 'UNDER_VERIFICATION',
        remarks: remarks ?? null,
      });
    });
    return this.getRequest(requestId);
  }

  async reject(
    requestId: string,
    adminId: string,
    actorRole: 'HOD' | 'SUPER_ADMIN',
    remarks: string,
  ): Promise<AdminRequestView> {
    await this.deps.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(certificateRequests)
        .where(eq(certificateRequests.requestId, requestId))
        .for('update')
        .limit(1);
      if (!request) throw errors.notFound();
      if (
        !canTransition(request.status as RequestStatus, 'REJECTED', actorRole, {
          remarks,
        })
      ) {
        throw errors.conflict(
          'Only submitted or under-verification requests can be rejected.',
          'INVALID_STATE_TRANSITION',
        );
      }

      await tx
        .update(certificateRequests)
        .set({ status: 'REJECTED', adminRemarks: remarks })
        .where(eq(certificateRequests.requestId, requestId));

      await appendAudit(tx, {
        requestId,
        actor: { role: actorRole, adminId },
        action: 'REJECTED',
        fromStatus: request.status as 'SUBMITTED' | 'UNDER_VERIFICATION',
        statusAfter: 'REJECTED',
        remarks,
      });
    });
    return this.getRequest(requestId);
  }

  async approve(
    requestId: string,
    adminId: string,
    actorRole: 'HOD' | 'SUPER_ADMIN',
    remarks: string | undefined,
  ): Promise<{ request: AdminRequestView; issuance: IssueResult }> {
    await this.deps.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(certificateRequests)
        .where(eq(certificateRequests.requestId, requestId))
        .for('update')
        .limit(1);
      if (!request) throw errors.notFound();
      if (!canTransition(request.status as RequestStatus, 'APPROVED', actorRole)) {
        throw errors.conflict(
          'Only an under-verification request can be approved.',
          'INVALID_STATE_TRANSITION',
        );
      }

      await tx
        .update(certificateRequests)
        .set({
          status: 'APPROVED',
          ...(remarks ? { adminRemarks: remarks } : {}),
        })
        .where(eq(certificateRequests.requestId, requestId));

      await appendAudit(tx, {
        requestId,
        actor: { role: actorRole, adminId },
        action: 'APPROVED',
        fromStatus: 'UNDER_VERIFICATION',
        statusAfter: 'APPROVED',
        remarks: remarks ?? null,
      });
    });

    const issuance = await this.issue(requestId, adminId, actorRole);
    return { request: await this.getRequest(requestId), issuance };
  }

  async generate(
    requestId: string,
    adminId: string,
    actorRole: 'HOD' | 'SUPER_ADMIN',
  ): Promise<{ request: AdminRequestView; issuance: IssueResult }> {
    const issuance = await this.issue(requestId, adminId, actorRole);
    return { request: await this.getRequest(requestId), issuance };
  }

  private async issue(
    requestId: string,
    adminId: string,
    actorRole: 'HOD' | 'SUPER_ADMIN',
  ): Promise<IssueResult> {
    const current = await this.getRow(requestId);

    if (current.request.status === 'READY') {
      const existing = mapAdminCertificate(current);
      if (existing) return { ok: true, certificate: existing };
    }
    if (!canTransition(current.request.status as RequestStatus, 'READY', actorRole)) {
      throw errors.conflict('Only an approved request can be issued.', 'INVALID_STATE_TRANSITION');
    }

    const issueDate = new Date();
    const certificateNumber = buildCertificateNumber(
      current.request.certificateType as CertificateType,
      issueDate,
      randomCertificateSuffix(),
    );
    const verificationCode = randomCode();
    const objectKey = certificateObjectKey();
    const data: CertificatePdfData = {
      certificateNumber,
      certificateType: current.request.certificateType as CertificateType,
      fullName: current.student.fullName,
      rollNumber: current.student.rollNumber,
      programme: current.student.programme,
      batchYear: current.student.batchYear,
      purpose: current.request.purpose,
      issueDate,
      verificationUrl: buildVerificationUrl(this.deps.config.publicAppUrl, verificationCode),
    };

    let generated: GeneratedPdf | null = null;
    const delay = this.deps.config.nodeEnv === 'test' ? 1 : 250;

    try {
      generated = await withRetry(
        async () => {
          const pdf = await this.generatePdf(data);
          await this.deps.storage.put(objectKey, pdf.buffer, 'application/pdf');
          return pdf;
        },
        {
          attempts: 3,
          baseDelayMs: delay,
          onFailure: (error, attempt) => {
            this.deps.logger.warn(
              { requestId, attempt, errorName: error instanceof Error ? error.name : 'Unknown' },
              'certificate_generation_attempt_failed',
            );
          },
        },
      );
    } catch (error) {
      await this.recordGenerationFailure(requestId, adminId, actorRole, error);
      return {
        ok: false,
        reason: 'Certificate generation failed after three attempts. Approval was preserved.',
      };
    }

    try {
      const certificate = await this.deps.db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(certificateRequests)
          .where(eq(certificateRequests.requestId, requestId))
          .for('update')
          .limit(1);
        if (!locked) throw errors.notFound();
        if (locked.status === 'READY') {
          const [existing] = await tx
            .select()
            .from(certificates)
            .where(eq(certificates.requestId, requestId))
            .limit(1);
          if (existing) return existing;
        }
        if (!canTransition(locked.status as RequestStatus, 'READY', actorRole)) {
          throw errors.conflict(
            'The request is not in an issuable state.',
            'INVALID_STATE_TRANSITION',
          );
        }
        if (!generated) throw errors.internal('Certificate PDF was not generated.');

        const [inserted] = await tx
          .insert(certificates)
          .values({
            requestId,
            certificateNumber,
            verificationCode,
            objectKey,
            sha256: generated.sha256,
            generatedBy: adminId,
            generatedAt: issueDate,
          })
          .returning();
        if (!inserted) throw errors.internal('Could not record the certificate.');

        await tx
          .update(certificateRequests)
          .set({ status: 'READY' })
          .where(eq(certificateRequests.requestId, requestId));

        await appendAudit(tx, {
          requestId,
          actor: { role: actorRole, adminId },
          action: 'GENERATED_PDF',
          fromStatus: 'APPROVED',
          statusAfter: 'READY',
          metadata: {
            certificateNumber,
            sha256: generated.sha256,
          },
        });
        return inserted;
      });

      if (!certificate) throw errors.internal('Could not issue the certificate.');
      return {
        ok: true,
        certificate: {
          certificateNumber: certificate.certificateNumber,
          verificationCode: certificate.verificationCode,
          verificationPath: `/verify/${certificate.verificationCode}`,
          generatedAt: certificate.generatedAt.toISOString(),
          sha256: certificate.sha256,
        },
      };
    } catch (error) {
      // The object was uploaded but not committed. Best-effort cleanup prevents orphans.
      await this.deps.storage.delete(objectKey).catch(() => undefined);
      if (isUniqueViolation(error)) {
        // Another request may have won the generation race. Return the committed certificate.
        const latest = await this.getRow(requestId);
        const existing = mapAdminCertificate(latest);
        if (existing) return { ok: true, certificate: existing };
      }
      if (error instanceof AppError) throw error;
      await this.recordGenerationFailure(requestId, adminId, actorRole, error);
      return {
        ok: false,
        reason: 'The certificate PDF could not be recorded. Approval was preserved.',
      };
    }
  }

  private async recordGenerationFailure(
    requestId: string,
    adminId: string,
    actorRole: 'HOD' | 'SUPER_ADMIN',
    error: unknown,
  ): Promise<void> {
    try {
      await this.deps.db.transaction(async (tx) => {
        await appendAudit(tx, {
          requestId,
          actor: { role: actorRole, adminId },
          action: 'GENERATION_FAILED',
          fromStatus: 'APPROVED',
          statusAfter: 'APPROVED',
          metadata: {
            attempts: 3,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
        });
      });
    } catch (auditError) {
      this.deps.logger.error(
        { requestId, err: auditError },
        'certificate_generation_failure_audit_failed',
      );
    }
    this.deps.logger.error({ requestId, err: error }, 'certificate_generation_failed');
  }

  async getDocumentObject(requestId: string): Promise<{ key: string; rollNumber: string }> {
    const [row] = await this.deps.db
      .select({
        key: certificateRequests.supportingDocUrl,
        rollNumber: students.rollNumber,
      })
      .from(certificateRequests)
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(eq(certificateRequests.requestId, requestId))
      .limit(1);
    if (!row?.key) throw errors.notFound('No supporting document is available.');
    return { key: row.key, rollNumber: row.rollNumber };
  }

  async getCertificateObject(
    requestId: string,
  ): Promise<{ key: string; rollNumber: string; certificateNumber: string }> {
    const [row] = await this.deps.db
      .select({
        objectKey: certificates.objectKey,
        rollNumber: students.rollNumber,
        certificateNumber: certificates.certificateNumber,
      })
      .from(certificates)
      .innerJoin(certificateRequests, eq(certificateRequests.requestId, certificates.requestId))
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(and(eq(certificates.requestId, requestId), eq(certificateRequests.status, 'READY')))
      .limit(1);
    if (!row) throw errors.notFound('The certificate is not ready.');
    return {
      key: row.objectKey,
      rollNumber: row.rollNumber,
      certificateNumber: row.certificateNumber,
    };
  }
}
