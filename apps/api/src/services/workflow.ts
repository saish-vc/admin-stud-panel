import type { PrincipalRole, RequestStatus } from '../db/schema.js';

export type WorkflowAction =
  | 'VERIFIED_DOCS'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUBMITTED'
  | 'GENERATED_PDF';

export interface TransitionRule {
  from: readonly RequestStatus[];
  to: RequestStatus;
  roles: readonly PrincipalRole[];
  remarksRequired?: boolean;
}

/**
 * Single source of truth for request state changes. Services lock the row and
 * call `canTransition`; the unit suite exhaustively covers this table.
 */
export const TRANSITIONS: Record<WorkflowAction, TransitionRule> = {
  VERIFIED_DOCS: {
    from: ['SUBMITTED'],
    to: 'UNDER_VERIFICATION',
    roles: ['CLERK', 'SUPER_ADMIN'],
  },
  APPROVED: {
    from: ['UNDER_VERIFICATION'],
    to: 'APPROVED',
    roles: ['HOD', 'SUPER_ADMIN'],
  },
  REJECTED: {
    from: ['SUBMITTED', 'UNDER_VERIFICATION'],
    to: 'REJECTED',
    roles: ['HOD', 'SUPER_ADMIN'],
    remarksRequired: true,
  },
  SUBMITTED: {
    from: ['REJECTED'],
    to: 'SUBMITTED',
    roles: ['STUDENT'],
  },
  GENERATED_PDF: {
    from: ['APPROVED'],
    to: 'READY',
    roles: ['HOD', 'SUPER_ADMIN'],
  },
};

export interface TransitionContext {
  remarks?: string | null;
}

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  role: PrincipalRole,
  context: TransitionContext = {},
): boolean {
  return Object.values(TRANSITIONS).some(
    (rule) =>
      rule.to === to &&
      rule.from.includes(from) &&
      rule.roles.includes(role) &&
      (!rule.remarksRequired || Boolean(context.remarks?.trim())),
  );
}
