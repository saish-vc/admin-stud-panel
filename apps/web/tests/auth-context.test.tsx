import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { server } from './msw/server';
import { errorResponse, studentSession } from './msw/handlers';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider', () => {
  it('starts in the loading state and settles to anonymous without a session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
  });

  it('restores an authenticated session from the refresh cookie', async () => {
    server.use(http.post('/api/auth/refresh', () => HttpResponse.json({ data: studentSession })));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toMatchObject({
      name: 'Ananya Menon',
      role: 'STUDENT',
      rollNumber: 'NTTF2026001',
    });
  });

  it('signs a student in and exposes the user', async () => {
    server.use(
      http.post('/api/auth/student/login', () => HttpResponse.json({ data: studentSession })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    let signedInName = '';
    await act(async () => {
      const user = await result.current.loginStudent('nttf2026001', 'Temp@Pass2026');
      signedInName = user.name;
    });

    expect(signedInName).toBe('Ananya Menon');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.email).toBe('ananya@students.nttf.ac.in');
  });

  it('surfaces failed sign-in attempts and stays anonymous', async () => {
    server.use(
      http.post('/api/auth/student/login', () =>
        errorResponse(401, 'INVALID_CREDENTIALS', 'Roll number or password is incorrect.'),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    let failure: unknown;
    await act(async () => {
      failure = await result.current
        .loginStudent('nttf2026001', 'wrong-password')
        .catch((caught: unknown) => caught);
    });

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('ignores a refresh that resolves after unmount', async () => {
    server.use(
      http.post('/api/auth/refresh', async () => {
        await delay(60);
        return HttpResponse.json({ data: studentSession });
      }),
    );
    const consoleError = vi.spyOn(console, 'error');
    const { unmount } = renderHook(() => useAuth(), { wrapper });

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
