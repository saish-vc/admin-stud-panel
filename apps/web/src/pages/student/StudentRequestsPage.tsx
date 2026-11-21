import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText, ListChecks, PlusCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/Feedback';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { certificateTypeLabel, formatDate } from '@/lib/format';
import type { Paginated, StudentRequest } from '@/types';

const PAGE_SIZE = 10;

export function StudentRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const requests = useQuery({
    queryKey: ['student', 'requests', page, PAGE_SIZE],
    queryFn: () =>
      api.get<Paginated<StudentRequest>>(`/api/student/requests?page=${page}&limit=${PAGE_SIZE}`),
  });

  const goToPage = (nextPage: number) => {
    setSearchParams(nextPage > 1 ? { page: String(nextPage) } : {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="My requests"
        title="Certificate requests"
        description="Every request you have submitted, with its current review status and issued documents."
        icon={ListChecks}
        actions={
          <Button asChild>
            <Link to="/student/new">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              New request
            </Link>
          </Button>
        }
      />

      {requests.isPending ? (
        <PageLoader label="Loading your requests…" />
      ) : requests.isError ? (
        <ErrorState
          title="Could not load your requests"
          error={requests.error}
          onRetry={() => void requests.refetch()}
        />
      ) : requests.data && requests.data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.data.items.map((request) => (
                    <TableRow key={request.requestId}>
                      <TableCell>
                        <span className="font-semibold">
                          {certificateTypeLabel(request.certificateType)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] uppercase text-muted-foreground">
                          {request.requestId.slice(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[26rem]">
                        <span className="line-clamp-2 text-sm text-muted-foreground">
                          {request.purpose}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/student/requests/${request.requestId}`}>
                            View
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border sm:hidden">
              {requests.data.items.map((request) => (
                <li key={request.requestId}>
                  <Link
                    to={`/student/requests/${request.requestId}`}
                    className="block px-4 py-4 transition-colors hover:bg-cream-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {certificateTypeLabel(request.certificateType)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {request.purpose}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Submitted {formatDate(request.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 pb-4">
              <Pagination
                page={requests.data.page}
                limit={requests.data.limit}
                total={requests.data.total}
                onPageChange={goToPage}
                noun="requests"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="No certificate requests yet"
          description="When you submit a request, it will appear here with its full review history."
          action={
            <Button asChild>
              <Link to="/student/new">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Start a request
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
