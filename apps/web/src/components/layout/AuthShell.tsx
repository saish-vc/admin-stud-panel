import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  variant = 'student',
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'student' | 'admin';
}) {
  return (
    <div className="container flex min-h-[calc(100vh-72px)] items-center py-10 sm:py-14">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-lift lg:grid-cols-[1fr_1.05fr]">
        <div className="surface-grid relative hidden flex-col justify-between bg-navy-950 p-9 text-cream-50 lg:flex">
          <div>
            <Logo tone="light" />
            <p className="mt-12 text-xs font-bold uppercase tracking-[0.2em] text-gold-400">
              {variant === 'admin' ? 'NTTF administration' : 'NTTF student services'}
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">
              {variant === 'admin'
                ? 'A controlled chain of review for every certificate.'
                : 'Official records, delivered with clarity.'}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-cream-100/65">
              {variant === 'admin'
                ? 'Clerks verify documents. Heads of Department approve issuance. Every action is attributed and audited.'
                : 'Track your request through verification and approval, then download the signed PDF with its public verification code.'}
            </p>
          </div>
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-cream-100/60">
                Access is limited to your own record. Sessions expire automatically and suspicious
                activity is logged.
              </p>
            </div>
            <p className="text-[11px] text-cream-100/35">
              © {new Date().getFullYear()} NTTF. Authorised use only.
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="lg:hidden">
            <Logo />
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-gold-600 lg:mt-0">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy-900">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-7">{footer}</div> : null}
          <div className="mt-8 border-t border-border pt-5">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
