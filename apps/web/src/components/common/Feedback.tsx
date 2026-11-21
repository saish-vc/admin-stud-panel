import { Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-16 text-muted-foreground"
      role="status"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full border border-gold-600/25 bg-gold-50">
          <Loader2 className="h-5 w-5 animate-spin text-gold-700" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Please try again in a moment.';
  const requestId = error instanceof ApiError ? error.requestId : undefined;

  return (
    <div
      className={cn(
        'rounded-xl border border-red-200 bg-red-50/70 p-6 text-left text-red-950',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-red-900">{message}</p>
          {requestId ? (
            <p className="mt-2 font-mono text-[11px] text-red-800/70">Reference: {requestId}</p>
          ) : null}
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-cream-50/60 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card">
        <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
