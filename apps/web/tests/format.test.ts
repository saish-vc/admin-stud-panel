import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_TYPES,
  actionLabel,
  actorRoleLabel,
  certificateTypeDescription,
  certificateTypeLabel,
  certificateTypeShortLabel,
  formatDate,
  formatDateTime,
  formatFileSize,
  initials,
  pluralise,
  roleLabel,
  statusLabel,
  statusTone,
} from '@/lib/format';

describe('certificate type helpers', () => {
  it('exposes the three supported certificate types', () => {
    expect(CERTIFICATE_TYPES.map((type) => type.value)).toEqual(['BONAFIDE', 'LC', 'DIPLOMA']);
  });

  it('maps every certificate type to display labels', () => {
    expect(certificateTypeLabel('BONAFIDE')).toBe('Bonafide Certificate');
    expect(certificateTypeShortLabel('LC')).toBe('Leaving');
    expect(certificateTypeDescription('DIPLOMA')).toMatch(/diploma award/i);
  });

  it('falls back to the raw value for unknown certificate types', () => {
    expect(certificateTypeLabel('PROVISIONAL')).toBe('PROVISIONAL');
    expect(certificateTypeShortLabel('PROVISIONAL')).toBe('PROVISIONAL');
    expect(certificateTypeDescription('PROVISIONAL')).toBe('');
  });
});

describe('status helpers', () => {
  it.each([
    ['SUBMITTED', 'Submitted', 'info'],
    ['UNDER_VERIFICATION', 'Under verification', 'warning'],
    ['APPROVED', 'Approved', 'gold'],
    ['REJECTED', 'Rejected', 'danger'],
    ['READY', 'Ready to download', 'success'],
  ])('maps %s to its label and tone', (status, label, tone) => {
    expect(statusLabel(status)).toBe(label);
    expect(statusTone(status)).toBe(tone);
  });

  it('uses an outline tone for unknown statuses', () => {
    expect(statusLabel('ARCHIVED')).toBe('ARCHIVED');
    expect(statusTone('ARCHIVED')).toBe('outline');
  });
});

describe('action and role helpers', () => {
  it('labels every audit action', () => {
    expect(actionLabel('GENERATED_PDF')).toBe('Certificate generated');
    expect(actionLabel('GENERATION_FAILED')).toBe('Certificate generation failed');
  });

  it('humanises unknown audit actions', () => {
    expect(actionLabel('DOCUMENT_REUPLOADED')).toBe('document reuploaded');
  });

  it('labels principal roles', () => {
    expect(roleLabel('HOD')).toBe('Head of Department');
    expect(roleLabel('SUPER_ADMIN')).toBe('Super administrator');
    expect(roleLabel('STUDENT')).toBe('Student');
  });

  it('treats the student actor as a role label', () => {
    expect(actorRoleLabel('STUDENT')).toBe('Student');
    expect(actorRoleLabel('CLERK')).toBe('Verification clerk');
  });
});

describe('date and display helpers', () => {
  it('formats valid dates and timestamps', () => {
    expect(formatDate('2003-04-15')).toContain('2003');
    expect(formatDateTime('2026-01-02T10:15:00.000Z')).toContain('2026');
  });

  it('returns an em dash for missing or invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('builds initials from the first two name parts', () => {
    expect(initials('Ananya Menon')).toBe('AM');
    expect(initials('  rahul   kumar  iyer ')).toBe('RK');
    expect(initials('')).toBe('');
  });

  it('pluralises counts', () => {
    expect(pluralise(1, 'request')).toBe('1 request');
    expect(pluralise(3, 'request')).toBe('3 requests');
    expect(pluralise(2, 'entry', 'entries')).toBe('2 entries');
  });

  it('formats file sizes across unit boundaries', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
