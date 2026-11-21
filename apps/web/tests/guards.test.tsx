import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth, RequireRole, RoleHomeRedirect } from '@/auth/guards';
import { useAuth } from '@/auth/AuthContext';
import type { Role } from '@/types';
import type { AuthUser } from '@/types';

vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(),
  homePathForRole: (role: string) => (role === 'STUDENT' ? '/student' : '/admin'),
  isAdminRole: (role: string) => role !== 'STUDENT',
}));

const mockedUseAuth = vi.mocked(useAuth);

function makeUser(role: Role, mustChangePassword = false): AuthUser {
  return {
    id: 'user-1',
    role,
    name: 'Test User',
    email: 'test@nttf.ac.in',
    mustChangePassword,
  };
}

function setAuth(status: 'loading' | 'authenticated' | 'anonymous', user: AuthUser | null): void {
  mockedUseAuth.mockReturnValue({
    status,
    user,
    loginStudent: vi.fn(),
    loginAdmin: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    setUser: vi.fn(),
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login screen</div>} />
        <Route path="/change-password" element={<div>change password screen</div>} />
        <Route path="/student" element={<div>student home</div>} />
        <Route path="/admin" element={<div>admin home</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/secure" element={<div>secure content</div>} />
        </Route>
        <Route element={<RequireRole roles={['HOD']} />}>
          <Route path="/hod" element={<div>hod content</div>} />
        </Route>
        <Route
          path="/guest"
          element={
            <GuestOnly>
              <div>guest form</div>
            </GuestOnly>
          }
        />
        <Route path="/home" element={<RoleHomeRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseAuth.mockReset();
});

describe('RequireAuth', () => {
  it('shows a loader while the session is restored', () => {
    setAuth('loading', null);
    renderAt('/secure');

    expect(screen.getByRole('status')).toHaveTextContent('Restoring your secure session');
  });

  it('redirects anonymous visitors to login', () => {
    setAuth('anonymous', null);
    renderAt('/secure');

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('forces a password change before opening protected pages', () => {
    setAuth('authenticated', makeUser('STUDENT', true));
    renderAt('/secure');

    expect(screen.getByText('change password screen')).toBeInTheDocument();
  });

  it('renders protected content for an authenticated user', () => {
    setAuth('authenticated', makeUser('STUDENT'));
    renderAt('/secure');

    expect(screen.getByText('secure content')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('allows a matching role', () => {
    setAuth('authenticated', makeUser('HOD'));
    renderAt('/hod');

    expect(screen.getByText('hod content')).toBeInTheDocument();
  });

  it('redirects a non-matching role to its home page', () => {
    setAuth('authenticated', makeUser('CLERK'));
    renderAt('/hod');

    expect(screen.getByText('admin home')).toBeInTheDocument();
  });

  it('redirects anonymous visitors to login', () => {
    setAuth('anonymous', null);
    renderAt('/hod');

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
});

describe('GuestOnly', () => {
  it('renders the form for anonymous visitors', () => {
    setAuth('anonymous', null);
    renderAt('/guest');

    expect(screen.getByText('guest form')).toBeInTheDocument();
  });

  it('sends an authenticated student to the student home', () => {
    setAuth('authenticated', makeUser('STUDENT'));
    renderAt('/guest');

    expect(screen.getByText('student home')).toBeInTheDocument();
  });

  it('sends an authenticated administrator to the admin home', () => {
    setAuth('authenticated', makeUser('SUPER_ADMIN'));
    renderAt('/guest');

    expect(screen.getByText('admin home')).toBeInTheDocument();
  });

  it('sends a user with a temporary password to change it', () => {
    setAuth('authenticated', makeUser('STUDENT', true));
    renderAt('/guest');

    expect(screen.getByText('change password screen')).toBeInTheDocument();
  });
});

describe('RoleHomeRedirect', () => {
  it.each([
    ['STUDENT', 'student home'],
    ['CLERK', 'admin home'],
    ['HOD', 'admin home'],
    ['SUPER_ADMIN', 'admin home'],
  ] as const)('routes %s to its workspace', (role, expected) => {
    setAuth('authenticated', makeUser(role));
    renderAt('/home');

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('routes a temporary-password user to the change-password page', () => {
    setAuth('authenticated', makeUser('HOD', true));
    renderAt('/home');

    expect(screen.getByText('change password screen')).toBeInTheDocument();
  });

  it('routes anonymous visitors to login', () => {
    setAuth('anonymous', null);
    renderAt('/home');

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
});
