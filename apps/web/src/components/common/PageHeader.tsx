import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="hidden h-11 w-11 place-items-center rounded-xl border border-gold-600/20 bg-gold-50 text-gold-700 sm:grid">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="prose-measure mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
