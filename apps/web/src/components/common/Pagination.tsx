import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  noun = 'items',
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{first}</span>–
        <span className="font-semibold text-foreground">{last}</span> of{' '}
        <span className="font-semibold text-foreground">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Button>
        <span className="px-1 text-sm text-muted-foreground" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
