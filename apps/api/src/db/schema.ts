import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const CERTIFICATE_TYPES = ['BONAFIDE', 'LC', 'DIPLOMA'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'READY',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const ADMIN_ROLES = ['CLERK', 'HOD', 'SUPER_ADMIN'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PRINCIPAL_ROLES = ['STUDENT', ...ADMIN_ROLES] as const;
export type PrincipalRole = (typeof PRINCIPAL_ROLES)[number];

export const AUDIT_ACTIONS = [
  'SUBMITTED',
  'VERIFIED_DOCS',
  'APPROVED',
  'REJECTED',
  'GENERATED_PDF',
  'GENERATION_FAILED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const STUDENT_STATUSES = ['ACTIVE', 'GRADUATED', 'DROPPED'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** Institutional master record. Never contains credentials. */
export const students = pgTable(
  'students',
  {
    studentId: uuid('student_id').primaryKey().defaultRandom(),
    rollNumber: varchar('roll_number', { length: 20 }).notNull(),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    email: varchar('email', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 15 }),
    programme: varchar('programme', { length: 50 }).notNull(),
    batchYear: integer('batch_year').notNull(),
    currentSemester: integer('current_semester'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('students_roll_number_uq').on(table.rollNumber),
    uniqueIndex('students_email_uq').on(table.email),
    check('students_status_check', sql`${table.status} in ('ACTIVE', 'GRADUATED', 'DROPPED')`),
    check('students_batch_year_check', sql`${table.batchYear} between 1990 and 2100`),
    check(
      'students_semester_check',
      sql`${table.currentSemester} is null or ${table.currentSemester} between 1 and 8`,
    ),
  ],
);

export const adminUsers = pgTable(
  'admin_users',
  {
    adminId: uuid('admin_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 100 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_users_email_uq').on(table.email),
    check('admin_users_role_check', sql`${table.role} in ('CLERK', 'HOD', 'SUPER_ADMIN')`),
  ],
);

export const studentCredentials = pgTable('student_credentials', {
  studentId: uuid('student_id')
    .primaryKey()
    .references(() => students.studentId, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certificateRequests = pgTable(
  'certificate_requests',
  {
    requestId: uuid('request_id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.studentId, { onDelete: 'restrict' }),
    certificateType: varchar('certificate_type', { length: 20 }).notNull(),
    purpose: text('purpose').notNull(),
    supportingDocUrl: text('supporting_doc_url'),
    status: varchar('status', { length: 30 }).notNull().default('SUBMITTED'),
    adminRemarks: text('admin_remarks'),
    verifiedBy: uuid('verified_by').references(() => adminUsers.adminId, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('certificate_requests_student_status_idx').on(table.studentId, table.status),
    index('certificate_requests_status_created_idx').on(table.status, table.createdAt),
    check(
      'certificate_requests_type_check',
      sql`${table.certificateType} in ('BONAFIDE', 'LC', 'DIPLOMA')`,
    ),
    check(
      'certificate_requests_status_check',
      sql`${table.status} in ('SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'READY')`,
    ),
    check(
      'certificate_requests_purpose_check',
      sql`char_length(${table.purpose}) between 10 and 1000`,
    ),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    logId: serial('log_id').primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => certificateRequests.requestId, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => adminUsers.adminId, { onDelete: 'restrict' }),
    actorStudentId: uuid('actor_student_id').references(() => students.studentId, {
      onDelete: 'restrict',
    }),
    actorRole: varchar('actor_role', { length: 20 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 30 }),
    statusAfter: varchar('status_after', { length: 30 }).notNull(),
    remarks: text('remarks'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_request_idx').on(table.requestId),
    index('audit_logs_actor_idx').on(table.actorId),
    check(
      'audit_logs_action_check',
      sql`${table.action} in ('SUBMITTED', 'VERIFIED_DOCS', 'APPROVED', 'REJECTED', 'GENERATED_PDF', 'GENERATION_FAILED')`,
    ),
    check(
      'audit_logs_actor_role_check',
      sql`${table.actorRole} in ('STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN')`,
    ),
    check(
      'audit_logs_single_actor_check',
      sql`num_nonnulls(${table.actorId}, ${table.actorStudentId}) = 1`,
    ),
    check(
      'audit_logs_status_after_check',
      sql`${table.statusAfter} in ('SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'READY')`,
    ),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    sessionId: uuid('session_id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').references(() => students.studentId, { onDelete: 'cascade' }),
    adminId: uuid('admin_id').references(() => adminUsers.adminId, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_hash_uq').on(table.tokenHash),
    index('auth_sessions_student_idx').on(table.studentId),
    index('auth_sessions_admin_idx').on(table.adminId),
    check(
      'auth_sessions_single_actor_check',
      sql`num_nonnulls(${table.studentId}, ${table.adminId}) = 1`,
    ),
  ],
);

export const certificates = pgTable(
  'certificates',
  {
    certificateId: uuid('certificate_id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => certificateRequests.requestId, { onDelete: 'restrict' }),
    certificateNumber: varchar('certificate_number', { length: 64 }).notNull(),
    verificationCode: varchar('verification_code', { length: 64 }).notNull(),
    objectKey: text('object_key').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    generatedBy: uuid('generated_by').references(() => adminUsers.adminId, {
      onDelete: 'set null',
    }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('certificates_request_uq').on(table.requestId),
    uniqueIndex('certificates_number_uq').on(table.certificateNumber),
    uniqueIndex('certificates_verification_code_uq').on(table.verificationCode),
  ],
);

export type Student = typeof students.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type CertificateRequest = typeof certificateRequests.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
