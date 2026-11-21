import * as React from 'react';
import { api, triggerBrowserDownload } from '@/lib/api';
import { useToast } from '@/components/common/Toast';

export function useFileDownload() {
  const { toast } = useToast();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  const download = React.useCallback(
    async (path: string, filename: string, label: string) => {
      setPendingKey(path);
      try {
        const { blob, filename: serverFilename } = await api.download(path);
        triggerBrowserDownload(blob, serverFilename ?? filename);
        toast({ title: `${label} downloaded`, variant: 'success' });
      } catch (error) {
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        setPendingKey(null);
      }
    },
    [toast],
  );

  return {
    download,
    isDownloading: (path: string) => pendingKey === path,
    anyDownloadPending: pendingKey !== null,
  };
}
