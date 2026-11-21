export const STUDENT = {
  rollNumber: 'NTTF2026001',
  password: 'Student@E2E2026',
  fullName: 'Ananya Menon',
  programme: 'Diploma in Mechanical Engineering',
} as const;

export const FORCED_PASSWORD_STUDENT = {
  rollNumber: 'NTTF2026002',
  password: '09122002',
  fullName: 'Rahul Iyer',
} as const;

export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'NttfE2E!2026';

export const CLERK = {
  email: 'clerk@nttf.ac.in',
  password: ADMIN_PASSWORD,
  role: 'CLERK',
} as const;

export const HOD = {
  email: 'hod@nttf.ac.in',
  password: ADMIN_PASSWORD,
  role: 'HOD',
} as const;

export const SUPER_ADMIN = {
  email: 'superadmin@nttf.ac.in',
  password: ADMIN_PASSWORD,
  role: 'SUPER_ADMIN',
} as const;

export interface StudentFixture {
  rollNumber: string;
  password: string;
}

export interface StaffFixture {
  email: string;
  password: string;
  role: string;
}
