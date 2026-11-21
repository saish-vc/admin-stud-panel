import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  GraduationCap,
  LockKeyhole,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CERTIFICATE_TYPES } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';

const STEPS = [
  {
    icon: FileText,
    title: 'Submit your request',
    text: 'Choose a certificate, explain its purpose, and attach supporting documents if needed.',
  },
  {
    icon: FileCheck2,
    title: 'Documents are verified',
    text: 'A verification clerk checks your record and supporting documents against the NTTF register.',
  },
  {
    icon: BadgeCheck,
    title: 'HOD approves',
    text: 'The Head of Department reviews the verified request and records a final decision.',
  },
  {
    icon: QrCode,
    title: 'Download and verify',
    text: 'Your signed PDF is issued with a unique code that anyone can validate online.',
  },
] as const;

const ASSURANCES = [
  {
    icon: ShieldCheck,
    title: 'Tamper-evident records',
    text: 'Every status change is written to an append-only audit trail.',
  },
  {
    icon: LockKeyhole,
    title: 'Private by default',
    text: 'Documents are stored privately and streamed only to authorised accounts.',
  },
  {
    icon: ScanLine,
    title: 'Instant validation',
    text: 'Employers can confirm a certificate with its QR code or verification number.',
  },
] as const;

export function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const handleVerify = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(trimmed)) {
      setError('Enter the 16–64 character verification code printed on the certificate.');
      return;
    }
    setError(null);
    navigate(`/verify/${encodeURIComponent(trimmed)}`);
  };

  const startPath = !user
    ? '/login'
    : user.role === 'STUDENT'
      ? user.mustChangePassword
        ? '/change-password'
        : '/student/new'
      : '/admin';

  return (
    <>
      <section className="relative overflow-hidden border-b border-navy-900/5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 h-[36rem] w-[36rem] rounded-full bg-gold-100/50 blur-3xl"
        />
        <div className="container relative grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="animate-fade-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold-600/25 bg-gold-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-gold-700">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              NTTF student services
            </p>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-navy-900 sm:text-5xl lg:text-[3.4rem]">
              Your NTTF certificate,
              <span className="block text-gold-600">without the queue.</span>
            </h1>
            <p className="prose-measure mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Request bonafide, leaving, and diploma certificates online. Track every review step,
              download the signed PDF, and let employers verify it instantly.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to={startPath}>
                  {user ? 'Open my dashboard' : 'Request a certificate'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/verify">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Verify a certificate
                </Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {['Official NTTF records', 'QR-enabled PDF', 'Audited approvals'].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute inset-x-6 top-8 h-full rotate-[3deg] rounded-2xl border border-navy-900/10 bg-cream-200/60"
            />
            <div className="relative rotate-[-1.5deg] rounded-2xl border border-navy-900/10 bg-card p-6 shadow-lift sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold-600">
                    NTTF · Certificate services
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-navy-900">
                    Certificate of Bonafide
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">Issued electronically · 2026</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-gold-500/40 bg-gold-50 text-gold-700">
                  <QrCode className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Awarded to</dt>
                  <dd className="font-semibold text-navy-900">Ananya Menon</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Programme</dt>
                  <dd className="max-w-[60%] text-right font-semibold text-navy-900">
                    Diploma in Mechanical Engineering
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Certificate no.</dt>
                  <dd className="font-mono text-xs font-semibold text-navy-900">
                    NTTF/BONAFIDE/2026/AC682DBE
                  </dd>
                </div>
              </dl>
              <div className="mt-6 rounded-xl bg-navy-950 p-4 text-cream-50">
                <div className="flex items-center gap-2 text-xs font-semibold text-gold-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Public verification
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-cream-100/70">
                  Scan the QR or enter the verification code to confirm the holder, programme, and
                  issue date.
                </p>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-3 hidden rounded-xl border border-border bg-card p-3 shadow-card sm:flex sm:items-center sm:gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-success-50 text-success-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">Ready to download</p>
                <p className="text-[11px] text-muted-foreground">Approved &amp; digitally issued</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-navy-900/5 bg-white/50">
          <div className="container grid gap-6 py-6 sm:grid-cols-3">
            {[
              ['3', 'certificate types'],
              ['5', 'tracked status stages'],
              ['1', 'verification code per PDF'],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-semibold text-navy-900">{value}</span>
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16 sm:py-20" aria-labelledby="process-heading">
        <div className="max-w-2xl">
          <p className="eyebrow">A clear process</p>
          <h2
            id="process-heading"
            className="mt-2 font-display text-3xl font-semibold text-navy-900 sm:text-4xl"
          >
            From request to verified PDF in four steps
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Each request moves through a documented review chain so that students, staff, and
            verifiers share the same source of truth.
          </p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-navy-900 text-cream-50">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-display text-2xl font-semibold text-gold-600">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container pb-8" aria-labelledby="types-heading">
        <div className="rounded-2xl border border-border bg-cream-100/60 p-6 sm:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Certificate types</p>
              <h2
                id="types-heading"
                className="mt-2 font-display text-3xl font-semibold text-navy-900"
              >
                The right document for the right purpose
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/login">
                Sign in to request
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {CERTIFICATE_TYPES.map((type) => (
              <article key={type.value} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <FileText className="h-5 w-5 text-gold-600" aria-hidden="true" />
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                    {type.value}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{type.label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {type.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-14" aria-labelledby="assurance-heading">
        <div className="grid gap-4 md:grid-cols-3">
          {ASSURANCES.map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-5">
              <item.icon className="h-5 w-5 text-gold-600" aria-hidden="true" />
              <h3
                id={item.title === 'Instant validation' ? 'assurance-heading' : undefined}
                className="mt-3 font-display text-lg font-semibold"
              >
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container pb-4">
        <div className="surface-grid overflow-hidden rounded-2xl bg-navy-950 px-6 py-10 text-cream-50 shadow-lift sm:px-10 sm:py-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-gold-400">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                For employers &amp; institutions
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">
                Confirm an NTTF certificate in seconds
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream-100/70 sm:text-base">
                Enter the code from the certificate or scan its QR code. You will see the holder,
                programme, certificate type, and issue date drawn from the NTTF register.
              </p>
            </div>
            <form
              onSubmit={handleVerify}
              noValidate
              className="rounded-xl border border-white/10 bg-white/[0.06] p-5"
            >
              <Label htmlFor="landing-code" className="text-cream-50">
                Verification code
              </Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="landing-code"
                  name="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. 7TxRG2qEgAVD3eep1TgarKll"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'landing-code-error' : 'landing-code-hint'}
                  className="border-white/20 bg-white/95 font-mono text-xs text-navy-900 placeholder:text-navy-900/40"
                />
                <Button type="submit" variant="accent" className="shrink-0">
                  Verify
                </Button>
              </div>
              {error ? (
                <p
                  id="landing-code-error"
                  role="alert"
                  className="mt-2 text-xs font-semibold text-red-200"
                >
                  {error}
                </p>
              ) : (
                <p id="landing-code-hint" className="mt-2 text-xs text-cream-100/70">
                  The code is printed below the QR on the certificate.
                </p>
              )}
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
