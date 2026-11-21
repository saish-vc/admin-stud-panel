import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ListFilter, Search, SlidersHorizontal, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/Feedback';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { CERTIFICATE_TYPES, STATUS_LABELS, certificateTypeLabel, formatDate } from '@/lib/format';
import type { AdminQueueItem, Paginated, RequestStatus } from '@/types';

const PAGE_SIZE = 15;
const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as RequestStatus[];

export function AdminQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';
  const q = searchParams.get('q') ?? '';

  const [search, setSearch] = React.useState(q);
  const [statusFilter, setStatusFilter] = React.useState(status);
  const [typeFilter, setTypeFilter] = React.useState(type);

  React.useEffect(() => {
    setSearch(q);
    setStatusFilter(status);
    setTypeFilter(type);
  }, [q, status, type]);

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (q) params.set('q', q);
    return params.toString();
  }, [page, status, type, q]);

  const queue = useQuery({
    queryKey: ['admin', 'requests', queryString],
    queryFn: () => api.get<Paginated<AdminQueueItem>>(`/api/admin/requests?${queryString}`),
  });

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setSearchParams({});
  };

  const filtered = Boolean(q || status || type);
  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (nextPage > 1) params.set('page', String(nextPage));
    else params.delete('page');
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Request queue"
        title="Certificate requests"
        description="Verify documents, review verified requests, and issue certificates. Open requests are prioritised."
        icon={ListFilter}
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form
            onSubmit={applyFilters}
            className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end"
          >
            <div>
              <Label htmlFor="queue-search">Search student</Label>
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="queue-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or roll number"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="queue-status">Status</Label>
              <select
                id="queue-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="queue-type">Certificate</Label>
              <select
                id="queue-type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <option value="">All types</option>
                {CERTIFICATE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 md:flex-none">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Apply
              </Button>
              {filtered ? (
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {queue.isPending ? (
        <PageLoader label="Loading the request queue…" />
      ) : queue.isError ? (
        <ErrorState
          title="Could not load the queue"
          error={queue.error}
          onRetry={() => void queue.refetch()}
        />
      ) : queue.data && queue.data.items.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.data.items.map((item) => (
                    <TableRow key={item.requestId}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-semibold">{item.studentName}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                          {item.rollNumber} · {item.batchYear}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {certificateTypeLabel(item.certificateType)}
                      </TableCell>
                      <TableCell className="max-w-[20rem]">
                        <span className="line-clamp-2 text-sm text-muted-foreground">
                          {item.purpose}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/requests/${item.requestId}`}>
                            Review
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {queue.data.items.map((item) => (
                <li key={item.requestId}>
                  <Link
                    to={`/admin/requests/${item.requestId}`}
                    className="block px-4 py-4 transition-colors hover:bg-cream-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.studentName}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {item.rollNumber}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {certificateTypeLabel(item.certificateType)} ·{' '}
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 pb-4">
              <Pagination
                page={queue.data.page}
                limit={queue.data.limit}
                total={queue.data.total}
                onPageChange={setPage}
                noun="requests"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title={filtered ? 'No requests match these filters' : 'The queue is clear'}
          description={
            filtered
              ? 'Try a different status, certificate type, or search term.'
              : 'New certificate requests submitted by students will appear here.'
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
