import { Outlet, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { GuestOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { ToastProvider } from '@/components/common/Toast';
import { DashboardLayout, PublicFooter, PublicHeader } from '@/components/layout/Layouts';
import { RouteAnnouncer } from '@/components/layout/RouteAnnouncer';
import { queryClient } from '@/lib/query-client';
import { LandingPage } from '@/pages/public/LandingPage';
import { VerifyPage } from '@/pages/public/VerifyPage';
import { StudentLoginPage } from '@/pages/auth/StudentLoginPage';
import { AdminLoginPage } from '@/pages/auth/AdminLoginPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';
import { NewRequestPage } from '@/pages/student/NewRequestPage';
import { StudentRequestsPage } from '@/pages/student/StudentRequestsPage';
import { StudentRequestDetailPage } from '@/pages/student/StudentRequestDetailPage';
import { StudentProfilePage } from '@/pages/student/StudentProfilePage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { AdminRequestDetailPage } from '@/pages/admin/AdminRequestDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

function DashboardFrame() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <a href="#main-content" className="skip-link">
              Skip to main content
            </a>
            <RouteAnnouncer />
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/verify" element={<VerifyPage />} />
                <Route path="/verify/:code" element={<VerifyPage />} />
                <Route
                  path="/login"
                  element={
                    <GuestOnly>
                      <StudentLoginPage />
                    </GuestOnly>
                  }
                />
                <Route
                  path="/admin/login"
                  element={
                    <GuestOnly>
                      <AdminLoginPage />
                    </GuestOnly>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              <Route path="/change-password" element={<ChangePasswordPage />} />

              <Route element={<RequireAuth />}>
                <Route element={<RequireRole roles={['STUDENT']} />}>
                  <Route element={<DashboardFrame />}>
                    <Route path="/student" element={<StudentDashboardPage />} />
                    <Route path="/student/new" element={<NewRequestPage />} />
                    <Route path="/student/requests" element={<StudentRequestsPage />} />
                    <Route
                      path="/student/requests/:requestId"
                      element={<StudentRequestDetailPage />}
                    />
                    <Route path="/student/profile" element={<StudentProfilePage />} />
                  </Route>
                </Route>

                <Route element={<RequireRole roles={['CLERK', 'HOD', 'SUPER_ADMIN']} />}>
                  <Route element={<DashboardFrame />}>
                    <Route path="/admin" element={<AdminDashboardPage />} />
                    <Route path="/admin/requests" element={<AdminQueuePage />} />
                    <Route path="/admin/requests/:requestId" element={<AdminRequestDetailPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
