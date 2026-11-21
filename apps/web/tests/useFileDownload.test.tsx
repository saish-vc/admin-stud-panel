import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { ToastProvider } from '@/components/common/Toast';
import { useFileDownload } from '@/hooks/useFileDownload';
import { server } from './msw/server';
import { errorResponse } from './msw/handlers';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

let downloadedName: string | null = null;

beforeEach(() => {
  downloadedName = null;
  URL.createObjectURL = vi.fn(() => 'blob:certificate');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download;
  });
});

describe('useFileDownload', () => {
  it('downloads with the server filename and announces success', async () => {
    server.use(
      http.get(
        '/api/student/requests/r1/certificate',
        () =>
          new HttpResponse('pdf', {
            status: 200,
            headers: {
              'content-disposition': 'attachment; filename="NTTF2026001-certificate.pdf"',
            },
          }),
      ),
    );
    const { result } = renderHook(() => useFileDownload(), { wrapper });

    await act(async () => {
      await result.current.download(
        '/api/student/requests/r1/certificate',
        'fallback.pdf',
        'Certificate',
      );
    });

    expect(downloadedName).toBe('NTTF2026001-certificate.pdf');
    expect(result.current.anyDownloadPending).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Certificate downloaded');
  });

  it('falls back to the supplied filename when the server omits one', async () => {
    server.use(
      http.get('/api/student/requests/r2/document', () => new HttpResponse('pdf', { status: 200 })),
    );
    const { result } = renderHook(() => useFileDownload(), { wrapper });

    await act(async () => {
      await result.current.download(
        '/api/student/requests/r2/document',
        'supporting-document.pdf',
        'Document',
      );
    });

    expect(downloadedName).toBe('supporting-document.pdf');
  });

  it('reports the pending key while the download is in flight', async () => {
    server.use(
      http.get('/api/student/requests/r3/certificate', async () => {
        await delay(80);
        return new HttpResponse('pdf', { status: 200 });
      }),
    );
    const { result } = renderHook(() => useFileDownload(), { wrapper });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.download(
        '/api/student/requests/r3/certificate',
        'fallback.pdf',
        'Certificate',
      );
    });

    await waitFor(() => expect(result.current.anyDownloadPending).toBe(true));
    expect(result.current.isDownloading('/api/student/requests/r3/certificate')).toBe(true);

    await act(async () => {
      await pending;
    });

    expect(result.current.anyDownloadPending).toBe(false);
    expect(result.current.isDownloading('/api/student/requests/r3/certificate')).toBe(false);
  });

  it('announces a download failure with the API message', async () => {
    server.use(
      http.get('/api/student/requests/r4/certificate', () =>
        errorResponse(500, 'PDF_FAILED', 'Certificate rendering failed.'),
      ),
    );
    const { result } = renderHook(() => useFileDownload(), { wrapper });

    await act(async () => {
      await result.current.download(
        '/api/student/requests/r4/certificate',
        'fallback.pdf',
        'Certificate',
      );
    });

    expect(downloadedName).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Download failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Certificate rendering failed.');
    expect(result.current.anyDownloadPending).toBe(false);
  });
});
