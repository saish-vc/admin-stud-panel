import { Link } from 'react-router-dom';
import { Copy, Download, ExternalLink, FileText, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileDownload } from '@/hooks/useFileDownload';
import { useToast } from '@/components/common/Toast';
import { certificateTypeLabel, formatDate } from '@/lib/format';
import type { CertificateSummary, StudentRequest } from '@/types';

export function CertificatePanel({
  request,
  certificate,
  requestPath,
}: {
  request: Pick<StudentRequest, 'requestId' | 'certificateType' | 'purpose'>;
  certificate: CertificateSummary;
  requestPath: 'student' | 'admin';
}) {
  const { download, isDownloading } = useFileDownload();
  const { toast } = useToast();
  const path =
    requestPath === 'student'
      ? `/api/student/requests/${request.requestId}/certificate`
      : `/api/admin/requests/${request.requestId}/certificate`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(certificate.verificationCode);
      toast({ title: 'Verification code copied', variant: 'success' });
    } catch {
      toast({
        title: 'Could not copy the code',
        description: 'Select the code and copy it manually.',
        variant: 'error',
      });
    }
  };

  return (
    <section
      aria-labelledby="certificate-heading"
      className="overflow-hidden rounded-xl border border-success-700/20 bg-card shadow-card"
    >
      <div className="flex items-center gap-3 border-b border-success-700/15 bg-success-50 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-success-700 text-white">
          <QrCode className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-success-700">
            Certificate issued
          </p>
          <h2
            id="certificate-heading"
            className="font-display text-lg font-semibold text-emerald-950"
          >
            Ready to download
          </h2>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Certificate number
            </dt>
            <dd className="mt-0.5 font-mono text-xs font-semibold break-all">
              {certificate.certificateNumber}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Verification code
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="rounded bg-cream-100 px-2 py-1 font-mono text-[11px] font-semibold break-all">
                {certificate.verificationCode}
              </code>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="rounded p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Copy verification code"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {certificateTypeLabel(request.certificateType)} · Issued
            </dt>
            <dd className="mt-0.5 font-semibold">{formatDate(certificate.generatedAt)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            className="w-full"
            onClick={() =>
              void download(
                path,
                `${certificate.certificateNumber.replaceAll('/', '-')}.pdf`,
                'Certificate',
              )
            }
            disabled={isDownloading(path)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isDownloading(path) ? 'Preparing PDF…' : 'Download certificate PDF'}
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link
              to={`/verify/${certificate.verificationCode}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open public verification
            </Link>
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Share the verification code or QR with anyone who needs to confirm this certificate.
        </p>
      </div>
    </section>
  );
}
