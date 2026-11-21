import type { AuthSession } from '@/types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;
let sessionListener: ((session: AuthSession | null) => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionListener(listener: ((session: AuthSession | null) => void) | null): void {
  sessionListener = listener;
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ErrorPayload | null = null;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    payload = null;
  }
  return new ApiError(
    response.status,
    payload?.error?.code ?? 'REQUEST_FAILED',
    payload?.error?.message ?? `The request failed (HTTP ${response.status}).`,
    payload?.error?.details,
    payload?.error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
  );
}

function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function performRefresh(): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      accessToken = null;
      return null;
    }
    const body = (await response.json()) as { data: AuthSession };
    accessToken = body.data.accessToken;
    return body.data;
  } catch {
    accessToken = null;
    return null;
  }
}

export async function refreshSession(): Promise<AuthSession | null> {
  // Concurrent 401s and React StrictMode mounts share one refresh request, which
  // is essential because refresh tokens rotate and reuse revokes the session.
  refreshPromise ??= performRefresh()
    .then((session) => {
      sessionListener?.(session);
      return session;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
  retryOn401?: boolean;
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const useAuth = options.auth !== false;
  const headers: Record<string, string> = { Accept: 'application/json', ...authHeaders() };
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(body !== undefined ? { body } : {}),
    credentials: 'include',
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 401 && useAuth && options.retryOn401 !== false) {
    const session = await refreshSession();
    if (session) {
      return request(path, { ...options, retryOn401: false });
    }
    sessionListener?.(null);
  }

  if (!response.ok) throw await parseError(response);
  return response;
}

async function json<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as { data: T };
  return body.data;
}

export const api = {
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return json<T>(await request(path, { ...(signal ? { signal } : {}) }));
  },

  async post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const response = await request(path, { ...options, method: 'POST', body });
    return json<T>(response);
  },

  async postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
    const response = await request(path, {
      method: 'POST',
      form,
      ...(signal ? { signal } : {}),
    });
    return json<T>(response);
  },

  async download(path: string): Promise<{ blob: Blob; filename: string | null }> {
    const response = await request(path, { method: 'GET' });
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await response.blob(), filename: match?.[1] ?? null };
  },

  async refresh(): Promise<AuthSession | null> {
    return refreshSession();
  },
};

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
