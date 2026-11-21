import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileDownload } from '@/hooks/useFileDownload';

export function DocumentPanel({
  requestId,
  scope,
  filenamePrefix,
}: {
  requestId: string;
  scope: 'student' | 'admin';
  filenamePrefix: string;
}) {
  const { download, isDownloading } = useFileDownload();
  const path = `/api/${scope}/requests/${requestId}/document`;

  return (
    <section
      aria-labelledby="document-heading"
      className="rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="document-heading" className="font-display text-base font-semibold">
            Supporting document
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Private file, available only to you and authorised NTTF staff.
          </p>
        </div>
        <FileText className="h-5 w-5 shrink-0 text-gold-600" aria-hidden="true" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        disabled={isDownloading(path)}
        onClick={() =>
          void download(path, `${filenamePrefix}-supporting-document`, 'Supporting document')
        }
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isDownloading(path) ? 'Opening…' : 'Download attachment'}
      </Button>
    </section>
  );
}
