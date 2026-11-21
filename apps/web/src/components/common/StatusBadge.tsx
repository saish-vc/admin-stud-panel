import { Badge } from '@/components/ui/badge';
import { statusLabel, statusTone } from '@/lib/format';
import type { RequestStatus } from '@/types';

export function StatusBadge({ status }: { status: RequestStatus | string }) {
  return (
    <Badge variant={statusTone(status)} data-testid="request-status">
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70"
      />
      {statusLabel(status)}
    </Badge>
  );
}
