export type Role = 'STUDENT' | 'CLERK' | 'HOD' | 'SUPER_ADMIN';

export type CertificateType = 'BONAFIDE' | 'LC' | 'DIPLOMA';

export type RequestStatus = 'SUBMITTED' | 'UNDER_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'READY';

export type AuditAction =
  | 'SUBMITTED'
  | 'VERIFIED_DOCS'
  | 'APPROVED'
  | 'REJECTED'
  | 'GENERATED_PDF'
  | 'GENERATION_FAILED';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  mustChangePassword: boolean;
  rollNumber?: string;
  programme?: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface StudentProfile {
  studentId: string;
  rollNumber: string;
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string | null;
  programme: string;
  batchYear: number;
  currentSemester: number | null;
  status: 'ACTIVE' | 'GRADUATED' | 'DROPPED';
  createdAt: string;
}

export interface CertificateSummary {
  certificateNumber: string;
  verificationCode: string;
  generatedAt: string;
  downloadUrl: string;
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

export interface StudentRequest {
  requestId: string;
  certificateType: CertificateType;
  purpose: string;
  status: RequestStatus;
  adminRemarks: string | null;
  supportingDocument: boolean;
  verifiedAt: string | null;
  createdAt: string;
  certificate: CertificateSummary | null;
  timeline: TimelineEntry[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface AdminStudent {
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

export interface AdminCertificate {
  certificateNumber: string;
  verificationCode: string;
  verificationPath: string;
  generatedAt: string;
  sha256: string;
}

export interface AdminRequest {
  requestId: string;
  certificateType: CertificateType;
  purpose: string;
  status: RequestStatus;
  adminRemarks: string | null;
  supportingDocument: boolean;
  verifiedAt: string | null;
  createdAt: string;
  student: AdminStudent;
  certificate: AdminCertificate | null;
  timeline: TimelineEntry[];
}

export interface AdminQueueItem {
  requestId: string;
  rollNumber: string;
  studentName: string;
  programme: string;
  batchYear: number;
  certificateType: CertificateType;
  status: RequestStatus;
  purpose: string;
  hasSupportingDocument: boolean;
  createdAt: string;
}

export interface AdminStats {
  byStatus: Record<RequestStatus, number>;
  totalRequests: number;
  totalIssued: number;
  awaitingVerification: number;
  awaitingApproval: number;
}

export interface VerificationResult {
  valid: true;
  certificateNumber: string;
  certificateType: CertificateType;
  holderName: string;
  rollNumber: string;
  programme: string;
  issuedAt: string;
}

export interface AdminDecisionResponse {
  request: AdminRequest;
  generationWarning: string | null;
}
