import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Hash,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageLoader, ErrorState } from '@/components/common/Feedback';
import { api, ApiError } from '@/lib/api';
import { certificateTypeLabel, formatDate } from '@/lib/format';
import type { VerificationResult } from '@/types';

const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function VerifyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [input, setInput] = React.useState(code ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);
  const activeCode = code?.trim();

  React.useEffect(() => {
    setInput(code ?? '');
  }, [code]);

  const verification = useQuery({
    queryKey: ['verification', activeCode],
    queryFn: () =>
      api.get<VerificationResult>(`/api/verify/${encodeURIComponent(activeCode ?? '')}`),
    enabled: Boolean(activeCode && CODE_PATTERN.test(activeCode)),
    retry: false,
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!CODE_PATTERN.test(trimmed)) {
      setFormError('Enter the 16–64 character code printed on the certificate.');
      return;
    }
    setFormError(null);
    navigate(`/verify/${encodeURIComponent(trimmed)}`);
  };

  const invalidCode = Boolean(activeCode && !CODE_PATTERN.test(activeCode));

  return (
    <div className="container py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </Button>

        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold-600/25 bg-gold-50 text-gold-700">
            <ScanLine className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
            Verify an NTTF certificate
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enter the code printed below the QR on the certificate. Verification confirms the
            holder, programme, certificate type, and issue date from the official register.
          </p>
        </div>

        <Card className="mx-auto mt-8 max-w-2xl">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} noValidate>
              <Label htmlFor="verification-code">Verification code</Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="verification-code"
                  name="code"
                  data-testid="verify-code-input"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="Enter the code from the certificate"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="font-mono text-sm"
                  aria-invalid={Boolean(formError || invalidCode)}
                  aria-describedby={
                    formError ? 'verification-code-error' : 'verification-code-hint'
                  }
                />
                <Button type="submit" data-testid="verify-submit" className="shrink-0">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Verify certificate
                </Button>
              </div>
              {formError ? (
                <p
                  id="verification-code-error"
                  role="alert"
                  className="mt-2 text-sm font-medium text-destructive"
                >
                  {formError}
                </p>
              ) : (
                <p id="verification-code-hint" className="mt-2 text-xs text-muted-foreground">
                  Format: 16–64 letters, numbers, hyphens, or underscores. The code is
                  case-sensitive.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="mx-auto mt-8 max-w-2xl" aria-live="polite">
          {!activeCode ? (
            <Card className="border-dashed bg-cream-50/60">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <Hash className="h-5 w-5 text-gold-600" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  The verification result will appear here after you submit a code. Only the
                  certificate details needed for validation are shown.
                </p>
              </CardContent>
            </Card>
          ) : invalidCode ? (
            <Alert className="border-red-200 bg-red-50 text-red-950">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Invalid verification code</AlertTitle>
              <AlertDescription>
                The code in this link is not in the expected format. Check the certificate and try
                again.
              </AlertDescription>
            </Alert>
          ) : verification.isPending ? (
            <PageLoader label="Checking the NTTF register…" />
          ) : verification.isError ? (
            verification.error instanceof ApiError && verification.error.status === 404 ? (
              <Alert className="border-red-200 bg-red-50 text-red-950">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Certificate not found</AlertTitle>
                <AlertDescription>
                  No certificate matches this code. Confirm the code exactly as printed, or contact
                  NTTF if the problem continues.
                </AlertDescription>
              </Alert>
            ) : (
              <ErrorState
                title="We could not complete the check"
                error={verification.error}
                onRetry={() => void verification.refetch()}
              />
            )
          ) : verification.data ? (
            <VerifiedCertificate result={verification.data} onReset={() => navigate('/verify')} />
          ) : null}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          Verification confirms that NTTF issued this certificate. It does not replace the signed
          PDF held by the certificate owner. If a result looks wrong, contact the NTTF certificate
          office before acting on it.
        </p>
      </div>
    </div>
  );
}

function VerifiedCertificate({
  result,
  onReset,
}: {
  result: VerificationResult;
  onReset: () => void;
}) {
  return (
    <Card className="overflow-hidden border-success-700/20">
      <div className="flex items-center gap-4 border-b border-success-700/15 bg-success-50 px-6 py-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success-700 text-white">
          <BadgeCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-success-700">
            Verified certificate
          </p>
          <h2 className="font-display text-xl font-semibold text-emerald-950">
            This certificate is valid
          </h2>
        </div>
      </div>
      <CardContent className="p-6 sm:p-8">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Certificate holder
            </dt>
            <dd className="mt-1 font-display text-lg font-semibold text-navy-900">
              {result.holderName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Roll number
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold">{result.rollNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Certificate type
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {certificateTypeLabel(result.certificateType)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Programme
            </dt>
            <dd className="mt-1 text-sm font-semibold">{result.programme}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Certificate number
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold break-all">
              {result.certificateNumber}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Issued on
            </dt>
            <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-gold-600" aria-hidden="true" />
              {formatDate(result.issuedAt)}
            </dd>
          </div>
        </dl>
        <div className="mt-7 flex flex-wrap gap-2 border-t border-border pt-5">
          <Button type="button" variant="outline" onClick={onReset}>
            Verify another certificate
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Return to home</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
