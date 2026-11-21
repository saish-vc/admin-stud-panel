import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import {
  adminUsers,
  auditLogs,
  students,
  type AdminRole,
  type AuditAction,
  type RequestStatus,
} from '../db/schema.js';
import { AppError } from './errors.js';

export type AuditActor =
  | { role: 'STUDENT'; studentId: string }
  | { role: AdminRole; adminId: string };

export interface AuditEntry {
  requestId: string;
  actor: AuditActor;
  action: AuditAction;
  fromStatus: RequestStatus | null;
  statusAfter: RequestStatus;
  remarks?: string | null;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(db: DbExecutor, entry: AuditEntry) {
  const actorValues =
    entry.actor.role === 'STUDENT'
      ? { actorStudentId: entry.actor.studentId, actorId: null }
      : { actorId: entry.actor.adminId, actorStudentId: null };

  const [row] = await db
    .insert(auditLogs)
    .values({
      requestId: entry.requestId,
      ...actorValues,
      actorRole: entry.actor.role,
      action: entry.action,
      fromStatus: entry.fromStatus,
      statusAfter: entry.statusAfter,
      remarks: entry.remarks ?? null,
      metadata: entry.metadata ?? null,
    })
    .returning();

  if (!row) throw new AppError(500, 'AUDIT_WRITE_FAILED', 'Could not write audit event.');
  return row;
}

export interface TimelineEntry {
  logId: number;
  action: string;
  fromStatus: string | null;
  statusAfter: string;
  actorRole: string;
  actorName: string;
  remarks: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export async function getTimelines(
  db: DbExecutor,
  requestIds: string[],
): Promise<Map<string, TimelineEntry[]>> {
  const output = new Map<string, TimelineEntry[]>();
  if (requestIds.length === 0) return output;

  const rows = await db
    .select({
      logId: auditLogs.logId,
      requestId: auditLogs.requestId,
      action: auditLogs.action,
      fromStatus: auditLogs.fromStatus,
      statusAfter: auditLogs.statusAfter,
      actorRole: auditLogs.actorRole,
      adminName: adminUsers.name,
      studentName: students.fullName,
      remarks: auditLogs.remarks,
      metadata: auditLogs.metadata,
      timestamp: auditLogs.timestamp,
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.actorId, adminUsers.adminId))
    .leftJoin(students, eq(auditLogs.actorStudentId, students.studentId))
    .where(inArray(auditLogs.requestId, requestIds))
    .orderBy(desc(auditLogs.timestamp), desc(auditLogs.logId));

  for (const row of rows) {
    const list = output.get(row.requestId) ?? [];
    list.push({
      logId: row.logId,
      action: row.action,
      fromStatus: row.fromStatus,
      statusAfter: row.statusAfter,
      actorRole: row.actorRole,
      actorName: row.adminName ?? row.studentName ?? 'NTTF system',
      remarks: row.remarks,
      metadata: row.metadata,
      timestamp: row.timestamp.toISOString(),
    });
    output.set(row.requestId, list);
  }
  return output;
}

/** Read-only query used by tests and support tooling; no mutation endpoint exists. */
export async function listAuditForRequest(db: DbExecutor, requestId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.requestId, requestId)))
    .orderBy(desc(auditLogs.logId));
}
