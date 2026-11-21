import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileText,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, PageLoader } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DocumentPanel } from '@/components/requests/DocumentPanel';
import { CertificatePanel } from '@/components/requests/CertificatePanel';
import { RequestTimeline } from '@/components/requests/RequestTimeline';
import { ResubmitDialog } from '@/components/requests/ResubmitDialog';
import { api } from '@/lib/api';
import { certificateTypeLabel, formatDateTime } from '@/lib/format';
import type { StudentRequest } from '@/types';

export function StudentRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [resubmitOpen, setResubmitOpen] = React.useState(false);

  const request = useQuery({
    queryKey: ['student', 'request', requestId],
    queryFn: () => api.get<StudentRequest>(`/api/student/requests/${requestId}`),
    enabled: Boolean(requestId),
  });

  if (!requestId)
    return <ErrorState title="Request not found" error={new Error('Missing request ID.')} />;
  if (request.isPending) return <PageLoader label="Loading your request…" />;
  if (request.isError) {
    return (
      <div className="space-y-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/student/requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to requests
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

  return (
    <div className="space-y-7">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link to="/student/requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to requests
          </Link>
        </Button>
        <PageHeader
          eyebrow="Request details"
          title={certificateTypeLabel(data.certificateType)}
          description={`Submitted ${formatDateTime(data.createdAt)} · Request ${data.requestId.slice(0, 8)}`}
          icon={FileText}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              {data.status === 'REJECTED' ? (
                <Button type="button" onClick={() => setResubmitOpen(true)}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Resubmit request
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      <StatusGuidance request={data} onResubmit={() => setResubmitOpen(true)} />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Purpose</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {data.purpose}
              </p>
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
                    {data.verifiedAt ? formatDateTime(data.verifiedAt) : 'Pending'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Review history</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline entries={data.timeline} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {data.status === 'READY' && data.certificate ? (
            <CertificatePanel request={data} certificate={data.certificate} requestPath="student" />
          ) : null}

          {data.supportingDocument ? (
            <DocumentPanel
              requestId={data.requestId}
              scope="student"
              filenamePrefix={data.requestId.slice(0, 8)}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Request ID
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs break-all">{data.requestId}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={data.status} />
                  </dd>
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

          {data.adminRemarks && data.status !== 'REJECTED' ? (
            <div className="rounded-xl border border-border bg-cream-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Reviewer remarks
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{data.adminRemarks}</p>
            </div>
          ) : null}
        </div>
      </div>

      <ResubmitDialog
        request={data}
        open={resubmitOpen}
        onOpenChange={setResubmitOpen}
        onSuccess={() => void request.refetch()}
      />
    </div>
  );
}

function StatusGuidance({
  request,
  onResubmit,
}: {
  request: StudentRequest;
  onResubmit: () => void;
}) {
  if (request.status === 'REJECTED') {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-950">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>This request was rejected</AlertTitle>
        <AlertDescription>
          {request.adminRemarks ? (
            <p className="mb-3">
              <span className="font-semibold">Reviewer remarks:</span> {request.adminRemarks}
            </p>
          ) : null}
          <p className="mb-3">
            You can correct the request and resubmit it. The full history, including this decision,
            is retained.
          </p>
          <Button type="button" size="sm" variant="destructive" onClick={onResubmit}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Resubmit with corrections
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const content = {
    SUBMITTED: {
      icon: Clock3,
      title: 'Waiting for document verification',
      text: 'A verification clerk will check your record and any supporting document. You do not need to do anything right now.',
      className: 'border-sky-200 bg-sky-50 text-sky-950',
    },
    UNDER_VERIFICATION: {
      icon: ShieldCheck,
      title: 'Documents verified — awaiting HOD approval',
      text: 'The certificate office has verified your documents. The Head of Department will now approve or reject the request.',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    },
    APPROVED: {
      icon: BadgeCheck,
      title: 'Approved — certificate generation in progress',
      text: 'Your request was approved. If the PDF could not be prepared immediately, the certificate office can retry issuance without another approval.',
      className: 'border-gold-600/25 bg-gold-50 text-gold-900',
    },
    READY: {
      icon: CheckCircle2,
      title: 'Certificate issued',
      text: 'Your signed certificate PDF is ready. Download it from the panel on this page and share its verification code with the recipient.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    },
  }[request.status];

  if (!content) return null;
  const Icon = content.icon;

  return (
    <Alert className={content.className}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>{content.text}</AlertDescription>
    </Alert>
  );
}
