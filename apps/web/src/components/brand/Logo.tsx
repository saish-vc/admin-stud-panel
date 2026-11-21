import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Logo({
  tone = 'dark',
  compact = false,
  className,
}: {
  tone?: 'dark' | 'light';
  compact?: boolean;
  className?: string;
}) {
  const light = tone === 'light';
  return (
    <Link
      to="/"
      className={cn(
        'group inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2',
        className,
      )}
      aria-label={compact ? 'NTTF Certificate Portal home' : undefined}
    >
      <span
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-xl border shadow-sm transition-transform group-hover:-translate-y-0.5',
          light
            ? 'border-white/15 bg-white/10 text-cream-50'
            : 'border-navy-900/10 bg-navy-900 text-cream-50',
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
          <path d="M6 8h20v3.2H6zM6 14.4h14v3.2H6zM6 20.8h20V24H6z" fill="currentColor" />
          <path d="M21 14.4h5l-2.5 4.5z" fill="#d3aa59" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-tight">
          <span
            className={cn(
              'block font-display text-lg font-semibold tracking-tight',
              light ? 'text-cream-50' : 'text-navy-900',
            )}
          >
            NTTF
          </span>
          <span
            className={cn(
              'block text-[11px] font-semibold uppercase tracking-[0.16em]',
              light ? 'text-cream-100/70' : 'text-muted-foreground',
            )}
          >
            Certificate Portal
          </span>
        </span>
      ) : null}
    </Link>
  );
}
