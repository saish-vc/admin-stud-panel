import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Pagination } from '@/components/common/Pagination';
import { RequestTimeline } from '@/components/requests/RequestTimeline';
import { ToastProvider, useToast } from '@/components/common/Toast';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { ApiError } from '@/lib/api';
import type { TimelineEntry } from '@/types';

const timeline: TimelineEntry[] = [
  {
    logId: 2,
    action: 'VERIFIED_DOCS',
    fromStatus: 'SUBMITTED',
    statusAfter: 'UNDER_VERIFICATION',
    actorRole: 'CLERK',
    actorName: 'Verification Clerk',
    remarks: 'Master record matches.',
    metadata: null,
    timestamp: '2026-01-02T10:00:00.000Z',
  },
  {
    logId: 1,
    action: 'SUBMITTED',
    fromStatus: null,
    statusAfter: 'SUBMITTED',
    actorRole: 'STUDENT',
    actorName: 'Ananya Menon',
    remarks: null,
    metadata: null,
    timestamp: '2026-01-01T10:00:00.000Z',
  },
];

describe('StatusBadge', () => {
  it.each([
    ['READY', 'Ready to download'],
    ['UNDER_VERIFICATION', 'Under verification'],
    ['REJECTED', 'Rejected'],
  ])('renders the %s label', (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByTestId('request-status')).toHaveTextContent(label);
  });
});

describe('Pagination', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(
      <Pagination page={1} limit={10} total={0} onPageChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('describes the current slice of a multi-page result set', () => {
    render(<Pagination page={2} limit={10} total={25} onPageChange={vi.fn()} noun="requests" />);

    expect(screen.getByText(/11/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('invokes the page change callback', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} limit={10} total={25} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('disables navigation at the boundaries', () => {
    const { rerender } = render(
      <Pagination page={1} limit={10} total={25} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();

    rerender(<Pagination page={3} limit={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});

describe('RequestTimeline', () => {
  it('shows an empty state when no history exists', () => {
    render(<RequestTimeline entries={[]} />);

    expect(screen.getByText(/No history has been recorded/)).toBeInTheDocument();
  });

  it('orders entries by log id and marks the latest event', () => {
    render(<RequestTimeline entries={timeline} />);

    const entries = screen.getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Request submitted');
    expect(entries[1]).toHaveTextContent('Documents verified');
    expect(entries[1]).toHaveTextContent('Latest');
    expect(entries[0]).not.toHaveTextContent('Latest');
  });

  it('renders the status transition and remarks', () => {
    render(<RequestTimeline entries={timeline} />);

    expect(screen.getByText(/Submitted →/)).toBeInTheDocument();
    expect(screen.getByText(/Under verification/)).toBeInTheDocument();
    expect(screen.getByText(/Master record matches\./)).toBeInTheDocument();
  });

  it('omits the transition arrow when the status does not change', () => {
    render(
      <RequestTimeline
        entries={[
          {
            ...timeline[0]!,
            fromStatus: 'UNDER_VERIFICATION',
            statusAfter: 'UNDER_VERIFICATION',
          },
        ]}
      />,
    );

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  function Harness({ variant }: { variant: 'success' | 'error' }) {
    const { toast } = useToast();
    return (
      <button
        type="button"
        onClick={() => toast({ title: 'Saved', description: 'All good', variant })}
      >
        Notify
      </button>
    );
  }

  it('announces a success toast and allows dismissal', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness variant="success" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('uses an alert role for error toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness variant="error" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(screen.getByRole('alert')).toHaveTextContent('All good');
  });
});

describe('feedback states', () => {
  it('renders an empty state with an action', () => {
    render(
      <EmptyState
        title="No requests yet"
        description="Create your first certificate request."
        action={<button type="button">New request</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No requests yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New request' })).toBeInTheDocument();
  });

  it('renders an API error with its reference id and retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        error={new ApiError(500, 'INTERNAL', 'Certificate generation failed.', undefined, 'req-42')}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Certificate generation failed.')).toBeInTheDocument();
    expect(screen.getByText('Reference: req-42')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
