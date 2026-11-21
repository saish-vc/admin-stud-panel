import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homePathForRole, isAdminRole, useAuth } from './AuthContext';
import { FullPageLoader } from '@/components/common/Feedback';
import type { Role } from '@/types';

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Restoring your secure session…" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

export function RequirePasswordChanged() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Restoring your secure session…" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your access…" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <Outlet />;
}

export function RoleHomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageLoader label="Opening your workspace…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={isAdminRole(user.role) ? '/admin' : '/student'} replace />;
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageLoader label="Checking your session…" />;
  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <>{children}</>;
}
