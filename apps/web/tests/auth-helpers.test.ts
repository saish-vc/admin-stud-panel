import { describe, expect, it } from 'vitest';
import { homePathForRole, isAdminRole } from '@/auth/AuthContext';

describe('auth role helpers', () => {
  it('routes students to the student workspace', () => {
    expect(homePathForRole('STUDENT')).toBe('/student');
  });

  it.each(['CLERK', 'HOD', 'SUPER_ADMIN'] as const)('routes %s to the admin workspace', (role) => {
    expect(homePathForRole(role)).toBe('/admin');
  });

  it('identifies administrative roles', () => {
    expect(isAdminRole('STUDENT')).toBe(false);
    expect(isAdminRole('CLERK')).toBe(true);
    expect(isAdminRole('HOD')).toBe(true);
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
  });
});
