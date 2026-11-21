import type { CertificateType, RequestStatus, Role } from '@/types';

export const CERTIFICATE_TYPES: Array<{
  value: CertificateType;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'BONAFIDE',
    label: 'Bonafide Certificate',
    shortLabel: 'Bonafide',
    description:
      'Confirms that you are a current student of NTTF, including your programme and semester.',
  },
  {
    value: 'LC',
    label: 'Leaving Certificate',
    shortLabel: 'Leaving',
    description:
      'Issued when you complete or discontinue a programme. Records your period of study at NTTF.',
  },
  {
    value: 'DIPLOMA',
    label: 'Diploma Certificate',
    shortLabel: 'Diploma',
    description:
      'Official diploma award certificate for graduated students, suitable for employers and higher education.',
  },
];

const TYPE_LOOKUP = new Map(CERTIFICATE_TYPES.map((type) => [type.value, type]));

export function certificateTypeLabel(type: CertificateType | string): string {
  return TYPE_LOOKUP.get(type as CertificateType)?.label ?? String(type);
}

export function certificateTypeShortLabel(type: CertificateType | string): string {
  return TYPE_LOOKUP.get(type as CertificateType)?.shortLabel ?? String(type);
}

export function certificateTypeDescription(type: CertificateType | string): string {
  return TYPE_LOOKUP.get(type as CertificateType)?.description ?? '';
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_VERIFICATION: 'Under verification',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  READY: 'Ready to download',
};

export function statusLabel(status: RequestStatus | string): string {
  return STATUS_LABELS[status as RequestStatus] ?? String(status);
}

export type BadgeTone = 'info' | 'warning' | 'success' | 'danger' | 'gold' | 'outline';

export function statusTone(status: RequestStatus | string): BadgeTone {
  switch (status) {
    case 'SUBMITTED':
      return 'info';
    case 'UNDER_VERIFICATION':
      return 'warning';
    case 'APPROVED':
      return 'gold';
    case 'READY':
      return 'success';
    case 'REJECTED':
      return 'danger';
    default:
      return 'outline';
  }
}

export const ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'Request submitted',
  VERIFIED_DOCS: 'Documents verified',
  APPROVED: 'Request approved',
  REJECTED: 'Request rejected',
  GENERATED_PDF: 'Certificate generated',
  GENERATION_FAILED: 'Certificate generation failed',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase();
}

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  CLERK: 'Verification clerk',
  HOD: 'Head of Department',
  SUPER_ADMIN: 'Super administrator',
};

export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? String(role);
}

export function actorRoleLabel(role: string): string {
  return role === 'STUDENT' ? 'Student' : roleLabel(role);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
