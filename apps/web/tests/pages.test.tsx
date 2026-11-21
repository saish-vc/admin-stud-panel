import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/auth/AuthContext';
import { StudentLoginPage } from '@/pages/auth/StudentLoginPage';
import { VerifyPage } from '@/pages/public/VerifyPage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import type { AdminQueueItem } from '@/types';
import { server } from './msw/server';
import {
  errorResponse,
  queueItem,
  studentSession,
  studentUser,
  verifiedCertificate,
} from './msw/handlers';

function renderRoutes(initialEntry: string, routes: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>{routes}</Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderLogin() {
  return renderRoutes(
    '/student/login',
    <>
      <Route path="/student/login" element={<StudentLoginPage />} />
      <Route path="/student" element={<div>Student dashboard</div>} />
      <Route path="/change-password" element={<div>Change password</div>} />
    </>,
  );
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Roll number'), 'NTTF2026001');
  await user.type(screen.getByLabelText('Password'), 'Temp@Pass2026');
}

describe('StudentLoginPage', () => {
  it('reports required-field failures without contacting the server', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Enter your NTTF roll number.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Roll number')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the submit button while signing in and then navigates', async () => {
    server.use(
      http.post('/api/auth/student/login', async () => {
        await delay(150);
        return HttpResponse.json({ data: studentSession });
      }),
    );
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(await screen.findByText('Student dashboard')).toBeInTheDocument();
  });

  it('shows the invalid-credentials message for a 401', async () => {
    server.use(
      http.post('/api/auth/student/login', () =>
        errorResponse(401, 'INVALID_CREDENTIALS', 'Roll number or password is incorrect.'),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Sign-in failed')).toBeInTheDocument();
    expect(screen.getByText('The roll number or password is incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('shows the rate-limit message for a 429', async () => {
    server.use(
      http.post('/api/auth/student/login', () =>
        errorResponse(429, 'RATE_LIMITED', 'Too many sign-in attempts.'),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Too many attempts')).toBeInTheDocument();
    expect(screen.getByText('Please wait a minute before trying again.')).toBeInTheDocument();
  });

  it('routes first-time users to the password change screen', async () => {
    server.use(
      http.post('/api/auth/student/login', () =>
        HttpResponse.json({
          data: { accessToken: 'temp-token', user: { ...studentUser, mustChangePassword: true } },
        }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Change password')).toBeInTheDocument();
  });
});

function renderVerify(entry: string) {
  return renderRoutes(
    entry,
    <>
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />
    </>,
  );
}

describe('VerifyPage', () => {
  it('shows a loading status while the register is checked', async () => {
    server.use(
      http.get('/api/verify/:code', async () => {
        await delay(150);
        return HttpResponse.json({ data: verifiedCertificate });
      }),
    );
    renderVerify('/verify/NTTF-VERIFY-E2E-2026-0001');

    expect(screen.getByRole('status')).toHaveTextContent('Checking the NTTF register…');
    expect(
      await screen.findByRole('heading', { name: 'This certificate is valid' }),
    ).toBeInTheDocument();
  });

  it('renders the holder, roll number, and certificate type for a valid code', async () => {
    server.use(
      http.get('/api/verify/:code', () => HttpResponse.json({ data: verifiedCertificate })),
    );
    renderVerify('/verify/NTTF-VERIFY-E2E-2026-0001');

    expect(
      await screen.findByRole('heading', { name: 'This certificate is valid' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ananya Menon')).toBeInTheDocument();
    expect(screen.getByText('NTTF2026001')).toBeInTheDocument();
    expect(screen.getByText('Bonafide Certificate')).toBeInTheDocument();
    expect(screen.getByText('NTTF/2026/BF/0001')).toBeInTheDocument();
  });

  it('reports an unknown code as not found', async () => {
    renderVerify('/verify/NTTF-VERIFY-E2E-2026-9999');

    expect(await screen.findByText('Certificate not found')).toBeInTheDocument();
  });

  it('rejects a code in the URL that is not in the expected format', async () => {
    renderVerify('/verify/short');

    expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
  });

  it('validates the code before navigating', async () => {
    const user = userEvent.setup();
    renderVerify('/verify');

    await user.type(screen.getByLabelText('Verification code'), 'short');
    await user.click(screen.getByRole('button', { name: /verify certificate/i }));

    expect(
      await screen.findByText('Enter the 16–64 character code printed on the certificate.'),
    ).toBeInTheDocument();
  });
});

function renderQueue() {
  return renderRoutes(
    '/admin/requests',
    <Route path="/admin/requests" element={<AdminQueuePage />} />,
  );
}

describe('AdminQueuePage', () => {
  it('shows the loading state before rendering rows', async () => {
    server.use(
      http.get('/api/admin/requests', async () => {
        await delay(150);
        return HttpResponse.json({ data: { items: [queueItem], page: 1, limit: 15, total: 1 } });
      }),
    );
    renderQueue();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the request queue…');
    expect((await screen.findAllByText('Ananya Menon')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /review/i }).length).toBeGreaterThan(0);
  });

  it('shows the empty state when the queue has no requests', async () => {
    renderQueue();

    expect(await screen.findByRole('heading', { name: 'The queue is clear' })).toBeInTheDocument();
  });

  it('shows a retryable error state when the queue fails to load', async () => {
    server.use(
      http.get('/api/admin/requests', () =>
        errorResponse(500, 'INTERNAL_ERROR', 'Queue unavailable.'),
      ),
    );
    renderQueue();

    expect(await screen.findByText('Could not load the queue')).toBeInTheDocument();
    expect(screen.getByText('Queue unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('sends the selected filters to the API', async () => {
    const approvedItem: AdminQueueItem = {
      ...queueItem,
      certificateType: 'LC',
      status: 'APPROVED',
    };
    const requestedUrls: URL[] = [];
    server.use(
      http.get('/api/admin/requests', ({ request }) => {
        const url = new URL(request.url);
        requestedUrls.push(url);
        const items =
          url.searchParams.get('status') === 'APPROVED' && url.searchParams.get('type') === 'LC'
            ? [approvedItem]
            : [];
        return HttpResponse.json({
          data: { items, page: 1, limit: 15, total: items.length },
        });
      }),
    );
    const user = userEvent.setup();
    renderQueue();

    expect(await screen.findByRole('heading', { name: 'The queue is clear' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'APPROVED');
    await user.selectOptions(screen.getByLabelText('Certificate'), 'LC');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect((await screen.findAllByText('Ananya Menon')).length).toBeGreaterThan(0);
    const lastUrl = requestedUrls.at(-1)!;
    expect(lastUrl.searchParams.get('status')).toBe('APPROVED');
    expect(lastUrl.searchParams.get('type')).toBe('LC');
  });
});
