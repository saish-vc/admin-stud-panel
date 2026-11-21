import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, PageLoader } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ActionDialog } from '@/components/admin/ActionDialog';
import { CertificatePanel } from '@/components/requests/CertificatePanel';
import { DocumentPanel } from '@/components/requests/DocumentPanel';
import { RequestTimeline } from '@/components/requests/RequestTimeline';
import { useToast } from '@/components/common/Toast';
import { api, ApiError } from '@/lib/api';
import { certificateTypeLabel, formatDate, formatDateTime, roleLabel } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import type { AdminDecisionResponse, AdminRequest } from '@/types';

type ActionKind = 'verify' | 'approve' | 'reject';

const ACTION_COPY: Record<
  ActionKind,
  {
    title: string;
    description: string;
    confirmLabel: string;
    destructive: boolean;
    remarksRequired: boolean;
  }
> = {
  verify: {
    title: 'Verify supporting documents',
    description:
      'This records that you checked the student’s record and documents. The request moves to Under verification for the Head of Department’s decision.',
    confirmLabel: 'Verify documents',
    destructive: false,
    remarksRequired: false,
  },
  approve: {
    title: 'Approve and issue certificate',
    description:
      'Approving moves the request to Approved and immediately attempts PDF generation. If generation fails, the approval is preserved and you can retry issuance.',
    confirmLabel: 'Approve request',
    destructive: false,
    remarksRequired: false,
  },
  reject: {
    title: 'Reject this request',
    description:
      'The student will see your remarks and can correct the purpose or document and resubmit. This decision remains in the audit history.',
    confirmLabel: 'Reject request',
    destructive: true,
    remarksRequired: true,
  },
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Please try again in a moment.';
}

export function AdminRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = React.useState<ActionKind | null>(null);
  const [remarks, setRemarks] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);

  const request = useQuery({
    queryKey: ['admin', 'request', requestId],
    queryFn: () => api.get<AdminRequest>(`/api/admin/requests/${requestId}`),
    enabled: Boolean(requestId),
  });

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const decision = useMutation({
    mutationFn: async (input: { kind: ActionKind; remarks: string }) => {
      const trimmed = input.remarks.trim();
      const body = trimmed ? { remarks: trimmed } : {};
      if (input.kind === 'verify') {
        return {
          kind: input.kind,
          response: await api.post<AdminRequest>(`/api/admin/requests/${requestId}/verify`, body),
        };
      }
      if (input.kind === 'reject') {
        return {
          kind: input.kind,
          response: await api.post<AdminRequest>(`/api/admin/requests/${requestId}/reject`, {
            remarks: trimmed,
          }),
        };
      }
      return {
        kind: input.kind,
        response: await api.post<AdminDecisionResponse>(
          `/api/admin/requests/${requestId}/approve`,
          body,
        ),
      };
    },
    onSuccess: (result) => {
      if (result.kind === 'verify') {
        toast({
          title: 'Documents verified',
          description: 'The request is now awaiting the Head of Department.',
          variant: 'success',
        });
      } else if (result.kind === 'reject') {
        toast({
          title: 'Request rejected',
          description: 'The student can correct and resubmit the request.',
          variant: 'success',
        });
      } else {
        const warning = (result.response as AdminDecisionResponse).generationWarning;
        toast(
          warning
            ? {
                title: 'Approved, but PDF generation failed',
                description: warning,
                variant: 'error',
              }
            : {
                title: 'Certificate approved and issued',
                description: 'The PDF is ready for the student to download.',
                variant: 'success',
              },
        );
      }
      setAction(null);
      setRemarks('');
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<AdminDecisionResponse>(`/api/admin/requests/${requestId}/generate`, undefined),
    onSuccess: (result) => {
      toast(
        result.generationWarning
          ? {
              title: 'PDF generation still failing',
              description: result.generationWarning,
              variant: 'error',
            }
          : {
              title: 'Certificate generated',
              description: 'The student can now download the signed PDF.',
              variant: 'success',
            },
      );
      invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Could not generate the certificate',
        description: errorMessage(error),
        variant: 'error',
      });
    },
  });

  if (!requestId) {
    return <ErrorState title="Request not found" error={new Error('Missing request ID.')} />;
  }
  if (request.isPending) return <PageLoader label="Loading the request…" />;
  if (request.isError) {
    return (
      <div className="space-y-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to queue
          </Link>
        </Button>
        <ErrorState
          title="This request could not be opened"
          error={request.error}
          onRetry={() => void request.refetch()}
        />
      </div>
    );
  }

  const data = request.data;
  if (!data) return null;

  const role = user?.role ?? 'CLERK';
  const canVerify = (role === 'CLERK' || role === 'SUPER_ADMIN') && data.status === 'SUBMITTED';
  const canApprove =
    (role === 'HOD' || role === 'SUPER_ADMIN') && data.status === 'UNDER_VERIFICATION';
  const canReject =
    (role === 'HOD' || role === 'SUPER_ADMIN') &&
    (data.status === 'SUBMITTED' || data.status === 'UNDER_VERIFICATION');
  const canGenerate = (role === 'HOD' || role === 'SUPER_ADMIN') && data.status === 'APPROVED';

  const openAction = (kind: ActionKind) => {
    setAction(kind);
    setRemarks('');
    setActionError(null);
  };

  const actionCopy = action ? ACTION_COPY[action] : null;

  return (
    <div className="space-y-7">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link to="/admin/requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to queue
          </Link>
        </Button>
        <PageHeader
          eyebrow="Request review"
          title={certificateTypeLabel(data.certificateType)}
          description={`${data.student.fullName} · ${data.student.rollNumber} · Submitted ${formatDateTime(data.createdAt)}`}
          icon={ClipboardCheck}
          actions={<StatusBadge status={data.status} />}
        />
      </div>

      {data.status === 'SUBMITTED' && role === 'HOD' ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Awaiting clerk verification</AlertTitle>
          <AlertDescription>
            A verification clerk must check the student’s documents before this request can be
            approved. You can still reject it with remarks if it is clearly ineligible.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-4 w-4 text-gold-600" aria-hidden="true" />
                Student record
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-display text-xl font-semibold">{data.student.fullName}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {data.student.rollNumber}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={data.student.status === 'ACTIVE' ? 'success' : 'outline'}>
                      {data.student.status}
                    </Badge>
                    <Badge variant="gold">Batch {data.student.batchYear}</Badge>
                    {data.student.currentSemester ? (
                      <Badge variant="outline">Semester {data.student.currentSemester}</Badge>
                    ) : null}
                  </div>
                </div>
                <dl className="grid gap-2 text-sm sm:text-right">
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <dt className="sr-only">Email</dt>
                    <dd className="break-all">{data.student.email}</dd>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <dt className="sr-only">Phone</dt>
                    <dd>{data.student.phone ?? 'Not recorded'}</dd>
                  </div>
                </dl>
              </div>
              <dl className="mt-5 grid gap-x-8 gap-y-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Programme
                  </dt>
                  <dd className="mt-0.5 font-semibold">{data.student.programme}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Date of birth
                  </dt>
                  <dd className="mt-0.5 font-semibold">{formatDate(data.student.dateOfBirth)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Request purpose</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.purpose}</p>
              <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Certificate type
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {certificateTypeLabel(data.certificateType)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Documents verified
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {data.verifiedAt ? formatDateTime(data.verifiedAt) : 'Not yet verified'}
                  </dd>
                </div>
                {data.adminRemarks ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Last reviewer remarks
                    </dt>
                    <dd className="mt-0.5 text-sm leading-relaxed">{data.adminRemarks}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline entries={data.timeline} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-gold-600/25">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-gold-600" aria-hidden="true" />
                Review actions
              </CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Acting as {roleLabel(role)}. Every action is attributed and written to the audit
                trail.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.status === 'READY' ? (
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>This request is complete. No further action is needed.</p>
                </div>
              ) : null}

              {data.status === 'REJECTED' ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-950">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>This request was rejected. The student may resubmit it with corrections.</p>
                </div>
              ) : null}

              {canVerify ? (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => openAction('verify')}
                  data-testid="admin-verify"
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                  Verify documents
                </Button>
              ) : null}

              {canApprove ? (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => openAction('approve')}
                  data-testid="admin-approve"
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  Approve &amp; issue certificate
                </Button>
              ) : null}

              {canReject ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => openAction('reject')}
                  data-testid="admin-reject"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Reject request
                </Button>
              ) : null}

              {canGenerate ? (
                <>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => generate.mutate()}
                    disabled={generate.isPending}
                    data-testid="admin-generate"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {generate.isPending ? 'Generating PDF…' : 'Retry PDF generation'}
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    The request is approved but the PDF is not available. Retrying does not require
                    another approval.
                  </p>
                </>
              ) : null}

              {!canVerify &&
              !canApprove &&
              !canReject &&
              !canGenerate &&
              data.status !== 'READY' &&
              data.status !== 'REJECTED' ? (
                <div className="flex items-start gap-2 rounded-lg bg-cream-50 p-3 text-sm text-muted-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    {data.status === 'UNDER_VERIFICATION'
                      ? 'Documents are verified. Only the Head of Department or a super administrator can decide this request.'
                      : 'No action is available for your role at this stage.'}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.status === 'READY' && data.certificate ? (
            <>
              <CertificatePanel
                request={data}
                certificate={{
                  certificateNumber: data.certificate.certificateNumber,
                  verificationCode: data.certificate.verificationCode,
                  generatedAt: data.certificate.generatedAt,
                  downloadUrl: '',
                }}
                requestPath="admin"
              />
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  PDF integrity fingerprint (SHA-256)
                </p>
                <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-muted-foreground">
                  {data.certificate.sha256}
                </p>
              </div>
            </>
          ) : null}

          {data.supportingDocument ? (
            <DocumentPanel
              requestId={data.requestId}
              scope="admin"
              filenamePrefix={data.student.rollNumber}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-gold-600" aria-hidden="true" />
                Request metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Request ID
                  </dt>
                  <dd className="mt-0.5 font-mono text-[11px] break-all">{data.requestId}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="text-right font-semibold">{formatDateTime(data.createdAt)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Supporting document</dt>
                  <dd className="font-semibold">{data.supportingDocument ? 'Attached' : 'None'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {action && actionCopy ? (
        <ActionDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setAction(null);
              setActionError(null);
            }
          }}
          title={actionCopy.title}
          description={actionCopy.description}
          confirmLabel={actionCopy.confirmLabel}
          destructive={actionCopy.destructive}
          remarksRequired={actionCopy.remarksRequired}
          remarks={remarks}
          onRemarksChange={setRemarks}
          onConfirm={() => decision.mutate({ kind: action, remarks })}
          pending={decision.isPending}
          error={actionError}
        />
      ) : null}
    </div>
  );
}
