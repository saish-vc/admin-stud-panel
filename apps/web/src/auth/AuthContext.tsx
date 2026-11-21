import * as React from 'react';
import { api, setAccessToken, setSessionListener } from '@/lib/api';
import type { AuthSession, AuthUser } from '@/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  loginStudent: (rollNumber: string, password: string) => Promise<AuthUser>;
  loginAdmin: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  setUser: (user: AuthUser) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [user, setUserState] = React.useState<AuthUser | null>(null);

  const applySession = React.useCallback((session: AuthSession | null) => {
    if (session) {
      setAccessToken(session.accessToken);
      setUserState(session.user);
      setStatus('authenticated');
      return;
    }
    setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
  }, []);

  React.useEffect(() => {
    let active = true;
    setSessionListener((session) => {
      if (!active) return;
      if (session) {
        setAccessToken(session.accessToken);
        setUserState(session.user);
        setStatus('authenticated');
      } else {
        setAccessToken(null);
        setUserState(null);
        setStatus('anonymous');
      }
    });

    api
      .refresh()
      .then((session) => {
        if (active && session) applySession(session);
        else if (active) setStatus('anonymous');
      })
      .catch(() => {
        if (active) setStatus('anonymous');
      });

    return () => {
      active = false;
      setSessionListener(null);
    };
  }, [applySession]);

  const loginStudent = React.useCallback(
    async (rollNumber: string, password: string) => {
      const session = await api.post<AuthSession>(
        '/api/auth/student/login',
        { rollNumber, password },
        { auth: false, retryOn401: false },
      );
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const loginAdmin = React.useCallback(
    async (email: string, password: string) => {
      const session = await api.post<AuthSession>(
        '/api/auth/admin/login',
        { email, password },
        { auth: false, retryOn401: false },
      );
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = React.useCallback(async () => {
    try {
      await api.post<undefined>('/api/auth/logout', undefined, { auth: false });
    } catch {
      // Local sign-out still proceeds if the network call fails.
    }
    applySession(null);
  }, [applySession]);

  const changePassword = React.useCallback(
    async (currentPassword: string, newPassword: string) => {
      const session = await api.post<AuthSession>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const setUser = React.useCallback((nextUser: AuthUser) => {
    setUserState(nextUser);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, user, loginStudent, loginAdmin, logout, changePassword, setUser }),
    [status, user, loginStudent, loginAdmin, logout, changePassword, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function homePathForRole(role: AuthUser['role']): string {
  return role === 'STUDENT' ? '/student' : '/admin';
}

export function isAdminRole(role: AuthUser['role']): boolean {
  return role === 'CLERK' || role === 'HOD' || role === 'SUPER_ADMIN';
}
