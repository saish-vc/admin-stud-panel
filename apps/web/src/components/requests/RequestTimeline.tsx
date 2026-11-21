import { AlertTriangle, BadgeCheck, FileCheck2, FilePlus2, FileText, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { actionLabel, actorRoleLabel, formatDateTime, statusLabel } from '@/lib/format';
import type { TimelineEntry } from '@/types';

const ACTION_ICONS = {
  SUBMITTED: FilePlus2,
  VERIFIED_DOCS: FileCheck2,
  APPROVED: BadgeCheck,
  REJECTED: XCircle,
  GENERATED_PDF: FileText,
  GENERATION_FAILED: AlertTriangle,
} as const;

const ACTION_TONES = {
  SUBMITTED: 'border-sky-200 bg-sky-50 text-sky-800',
  VERIFIED_DOCS: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-red-200 bg-red-50 text-red-800',
  GENERATED_PDF: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  GENERATION_FAILED: 'border-red-200 bg-red-50 text-red-800',
} as const;

function toneFor(action: string): string {
  return (
    ACTION_TONES[action as keyof typeof ACTION_TONES] ??
    'border-border bg-cream-50 text-muted-foreground'
  );
}

export function RequestTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-cream-50/60 px-4 py-6 text-sm text-muted-foreground">
        No history has been recorded for this request yet.
      </p>
    );
  }

  const ascending = [...entries].sort((a, b) => a.logId - b.logId);

  return (
    <ol aria-label="Request history" className="relative space-y-5">
      {ascending.map((entry, index) => {
        const Icon = ACTION_ICONS[entry.action as keyof typeof ACTION_ICONS] ?? FileText;
        const latest = index === ascending.length - 1;
        return (
          <li key={entry.logId} className="relative flex gap-4">
            <span
              className={cn(
                'relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border',
                toneFor(entry.action),
              )}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            {index < ascending.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[17px] top-9 h-[calc(100%+0.25rem)] w-px bg-border"
              />
            ) : null}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold">{actionLabel(entry.action)}</p>
                {latest ? (
                  <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream-50">
                    Latest
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.actorName} · {actorRoleLabel(entry.actorRole)} ·{' '}
                <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
              </p>
              {entry.fromStatus && entry.fromStatus !== entry.statusAfter ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {statusLabel(entry.fromStatus)} →{' '}
                  <strong className="text-foreground">{statusLabel(entry.statusAfter)}</strong>
                </p>
              ) : null}
              {entry.remarks ? (
                <p className="mt-2 rounded-lg bg-cream-50 px-3 py-2 text-sm leading-relaxed text-foreground">
                  “{entry.remarks}”
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
