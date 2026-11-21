import { describe, expect, it } from 'vitest';
import type { PrincipalRole, RequestStatus } from '../../src/db/schema.js';
import { TRANSITIONS, canTransition } from '../../src/services/workflow.js';

const STATUSES: RequestStatus[] = [
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'READY',
];
const ROLES: PrincipalRole[] = ['STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN'];

const LEGAL: Record<string, PrincipalRole[]> = {
  'SUBMITTED->UNDER_VERIFICATION': ['CLERK', 'SUPER_ADMIN'],
  'UNDER_VERIFICATION->APPROVED': ['HOD', 'SUPER_ADMIN'],
  'SUBMITTED->REJECTED': ['HOD', 'SUPER_ADMIN'],
  'UNDER_VERIFICATION->REJECTED': ['HOD', 'SUPER_ADMIN'],
  'REJECTED->SUBMITTED': ['STUDENT'],
  'APPROVED->READY': ['HOD', 'SUPER_ADMIN'],
};

describe('certificate workflow state machine', () => {
  it('declares one rule per workflow action', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([
      'APPROVED',
      'GENERATED_PDF',
      'REJECTED',
      'SUBMITTED',
      'VERIFIED_DOCS',
    ]);
    expect(TRANSITIONS.VERIFIED_DOCS.to).toBe('UNDER_VERIFICATION');
    expect(TRANSITIONS.APPROVED.to).toBe('APPROVED');
    expect(TRANSITIONS.REJECTED.to).toBe('REJECTED');
    expect(TRANSITIONS.SUBMITTED.to).toBe('SUBMITTED');
    expect(TRANSITIONS.GENERATED_PDF.to).toBe('READY');
  });

  it('exhaustively enforces the role x status x target matrix', () => {
    const failures: string[] = [];

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const role of ROLES) {
          const expected = (LEGAL[`${from}->${to}`] ?? []).includes(role);
          const actual = canTransition(from, to, role, { remarks: 'Verified against records.' });
          if (actual !== expected) {
            failures.push(`${role} ${from}->${to}: expected ${expected}, received ${actual}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it.each([
    ['SUBMITTED', 'UNDER_VERIFICATION', 'CLERK'],
    ['SUBMITTED', 'UNDER_VERIFICATION', 'SUPER_ADMIN'],
    ['UNDER_VERIFICATION', 'APPROVED', 'HOD'],
    ['APPROVED', 'READY', 'HOD'],
    ['REJECTED', 'SUBMITTED', 'STUDENT'],
  ] as const)('allows %s -> %s by %s', (from, to, role) => {
    expect(canTransition(from, to, role, { remarks: 'Verified.' })).toBe(true);
  });

  it.each([
    ['SUBMITTED', 'APPROVED', 'HOD'],
    ['SUBMITTED', 'APPROVED', 'SUPER_ADMIN'],
    ['SUBMITTED', 'READY', 'SUPER_ADMIN'],
    ['UNDER_VERIFICATION', 'READY', 'HOD'],
    ['REJECTED', 'READY', 'SUPER_ADMIN'],
    ['APPROVED', 'REJECTED', 'HOD'],
    ['READY', 'SUBMITTED', 'STUDENT'],
    ['REJECTED', 'UNDER_VERIFICATION', 'CLERK'],
    ['UNDER_VERIFICATION', 'SUBMITTED', 'STUDENT'],
    ['APPROVED', 'UNDER_VERIFICATION', 'HOD'],
  ] as const)('forbids %s -> %s by %s', (from, to, role) => {
    expect(canTransition(from, to, role, { remarks: 'Verified.' })).toBe(false);
  });

  it('forbids CLERK from final approval and issuance', () => {
    expect(canTransition('UNDER_VERIFICATION', 'APPROVED', 'CLERK')).toBe(false);
    expect(canTransition('APPROVED', 'READY', 'CLERK')).toBe(false);
  });

  it('requires non-blank remarks for rejection', () => {
    expect(canTransition('SUBMITTED', 'REJECTED', 'HOD')).toBe(false);
    expect(canTransition('SUBMITTED', 'REJECTED', 'HOD', { remarks: '' })).toBe(false);
    expect(canTransition('SUBMITTED', 'REJECTED', 'HOD', { remarks: '   ' })).toBe(false);
    expect(canTransition('SUBMITTED', 'REJECTED', 'HOD', { remarks: 'Missing document.' })).toBe(
      true,
    );
  });
});
