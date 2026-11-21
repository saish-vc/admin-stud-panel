import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import {
  ApiError,
  api,
  getAccessToken,
  setAccessToken,
  setSessionListener,
  triggerBrowserDownload,
} from '@/lib/api';
import { server } from './msw/server';
import { errorResponse, studentSession } from './msw/handlers';

beforeEach(() => {
  setAccessToken(null);
  setSessionListener(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('sends the bearer token and unwraps the data envelope', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/probe/profile', ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ data: { ok: true } });
      }),
    );
    setAccessToken('token-1');

    await expect(api.get('/api/probe/profile')).resolves.toEqual({ ok: true });
    expect(seen).toEqual(['Bearer token-1']);
  });

  it('omits authorization when no access token is held', async () => {
    let authorization: string | null = 'unset';
    server.use(
      http.get('/api/probe/public', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({ data: null });
      }),
    );

    await api.get('/api/probe/public');

    expect(authorization).toBeNull();
  });

  it('serialises JSON request bodies', async () => {
    let contentType: string | null = null;
    let body: unknown = null;
    server.use(
      http.post('/api/probe/requests', async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.json();
        return HttpResponse.json({ data: { id: 'r1' } }, { status: 201 });
      }),
    );

    await api.post('/api/probe/requests', { certificateType: 'LC', purpose: 'Need it' });

    expect(contentType).toContain('application/json');
    expect(body).toEqual({ certificateType: 'LC', purpose: 'Need it' });
  });

  it('sends multipart form data without a JSON content type', async () => {
    let contentType: string | null = null;
    let purpose: FormDataEntryValue | null = null;
    server.use(
      http.post('/api/probe/forms', async ({ request }) => {
        contentType = request.headers.get('content-type');
        purpose = (await request.formData()).get('purpose');
        return HttpResponse.json({ data: { id: 'r1' } });
      }),
    );
    const form = new FormData();
    form.append('purpose', 'Bank loan');

    await api.postForm('/api/probe/forms', form);

    expect(contentType).toContain('multipart/form-data');
    expect(contentType).not.toContain('application/json');
    expect(purpose).toBe('Bank loan');
  });

  it('returns undefined for 204 responses', async () => {
    await expect(api.post<undefined>('/api/auth/logout')).resolves.toBeUndefined();
  });

  it('parses a structured API error', async () => {
    server.use(
      http.get('/api/probe/forbidden', () =>
        HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Your role cannot perform this action.',
              details: { role: 'CLERK' },
              requestId: 'req-42',
            },
          },
          { status: 403 },
        ),
      ),
    );

    const error = await api.get('/api/probe/forbidden').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Your role cannot perform this action.',
      details: { role: 'CLERK' },
      requestId: 'req-42',
    });
  });

  it('falls back to transport details when the error body is not JSON', async () => {
    server.use(
      http.get(
        '/api/probe/upstream',
        () =>
          new HttpResponse('upstream failure', {
            status: 502,
            headers: { 'x-request-id': 'edge-77' },
          }),
      ),
    );

    const error = await api.get('/api/probe/upstream').catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 502,
      code: 'REQUEST_FAILED',
      message: 'The request failed (HTTP 502).',
      requestId: 'edge-77',
    });
  });

  it('refreshes an expired access token and retries once', async () => {
    let profileCalls = 0;
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ data: studentSession })),
      http.get('/api/probe/profile', ({ request }) => {
        profileCalls += 1;
        const authorization = request.headers.get('authorization');
        if (authorization === 'Bearer stale-token') {
          return errorResponse(401, 'TOKEN_EXPIRED', 'Access token expired.');
        }
        return HttpResponse.json({ data: { authorization } });
      }),
    );
    const listener = vi.fn();
    setSessionListener(listener);
    setAccessToken('stale-token');

    const result = await api.get<{ authorization: string }>('/api/probe/profile');

    expect(profileCalls).toBe(2);
    expect(result.authorization).toBe('Bearer student-access-token');
    expect(getAccessToken()).toBe('student-access-token');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'student-access-token' }),
    );
  });

  it('surfaces the original 401 when refreshing fails', async () => {
    server.use(
      http.get('/api/probe/profile', () =>
        errorResponse(401, 'TOKEN_EXPIRED', 'Access token expired.'),
      ),
    );
    const listener = vi.fn();
    setSessionListener(listener);
    setAccessToken('stale-token');

    const error = await api.get('/api/probe/profile').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
  });

  it('shares one refresh request between concurrent 401 responses', async () => {
    let refreshCalls = 0;
    server.use(
      http.post('/api/auth/refresh', async () => {
        refreshCalls += 1;
        await delay(20);
        return HttpResponse.json({ data: studentSession });
      }),
      http.get('/api/probe/profile', ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer stale-token') {
          return errorResponse(401, 'TOKEN_EXPIRED', 'Expired.');
        }
        return HttpResponse.json({ data: { url: request.url } });
      }),
      http.get('/api/probe/requests', ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer stale-token') {
          return errorResponse(401, 'TOKEN_EXPIRED', 'Expired.');
        }
        return HttpResponse.json({ data: { url: request.url } });
      }),
    );
    setAccessToken('stale-token');

    await Promise.all([api.get('/api/probe/profile'), api.get('/api/probe/requests')]);

    expect(refreshCalls).toBe(1);
  });

  it('reads the filename from the download response', async () => {
    server.use(
      http.get(
        '/api/probe/certificate',
        () =>
          new HttpResponse('pdf-bytes', {
            status: 200,
            headers: {
              'content-disposition': 'attachment; filename="NTTF2026001-certificate.pdf"',
            },
          }),
      ),
    );

    const result = await api.download('/api/probe/certificate');

    expect(result.filename).toBe('NTTF2026001-certificate.pdf');
    expect(result.blob.size).toBe('pdf-bytes'.length);
  });

  it('returns a null filename when the server does not provide one', async () => {
    server.use(
      http.get('/api/probe/raw-certificate', () => new HttpResponse('pdf-bytes', { status: 200 })),
    );

    const result = await api.download('/api/probe/raw-certificate');

    expect(result.filename).toBeNull();
  });
});

describe('triggerBrowserDownload', () => {
  it('creates a temporary link and revokes the object URL afterwards', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:certificate');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    let downloadedName: string | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    triggerBrowserDownload(new Blob(['pdf']), 'certificate.pdf');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(downloadedName).toBe('certificate.pdf');
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:certificate');
    clickSpy.mockRestore();
    vi.useRealTimers();
  });
});
