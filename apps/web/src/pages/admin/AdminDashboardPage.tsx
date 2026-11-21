import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { certificateTypeLabel, formatDate, roleLabel } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import type { AdminQueueItem, AdminStats, Paginated } from '@/types';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'CLERK';
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/api/admin/stats'),
  });
  const queue = useQuery({
    queryKey: ['admin', 'requests', 'preview'],
    queryFn: () => api.get<Paginated<AdminQueueItem>>('/api/admin/requests?page=1&limit=6'),
  });

  const cards = [
    {
      label: 'Awaiting verification',
      value: stats.data?.awaitingVerification,
      hint: 'Clerk action',
      icon: FileCheck2,
      tone: 'bg-sky-50 text-sky-800 border-sky-200',
    },
    {
      label: 'Awaiting approval',
      value: stats.data?.awaitingApproval,
      hint: 'HOD action',
      icon: ClipboardCheck,
      tone: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      label: 'Certificates issued',
      value: stats.data?.totalIssued,
      hint: 'Ready to download',
      icon: BadgeCheck,
      tone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    {
      label: 'Total requests',
      value: stats.data?.totalRequests,
      hint: 'All time',
      icon: Inbox,
      tone: 'bg-cream-100 text-navy-900 border-border',
    },
  ];

  const roleHint =
    role === 'CLERK'
      ? 'Your role verifies documents. Approvals and rejections belong to the Head of Department.'
      : role === 'HOD'
        ? 'Your role approves or rejects verified requests and issues the certificate PDF.'
        : 'Your role can verify documents, approve or reject requests, and retry certificate issuance.';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Certificate operations"
        description="Monitor the queue, verify documents, and issue certificates with a complete audit trail."
        icon={Gauge}
        actions={
          <Button asChild>
            <Link to="/admin/requests">
              Open request queue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-gold-600/20 bg-gold-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-gold-900">Signed in as {roleLabel(role)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gold-900/70">{roleHint}</p>
          </div>
        </div>
      </div>

      {stats.isPending ? (
        <PageLoader label="Loading operational statistics…" />
      ) : stats.isError ? (
        <ErrorState
          title="Could not load statistics"
          error={stats.error}
          onRetry={() => void stats.refetch()}
        />
      ) : stats.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-2 font-display text-3xl font-semibold text-navy-900">
                    {card.value ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </div>
                <span
                  className={`grid h-10 w-10 place-items-center rounded-lg border ${card.tone}`}
                >
                  <card.icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Action queue</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Open requests are shown first, newest within each stage.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/requests">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-2">
          {queue.isPending ? (
            <PageLoader label="Loading the queue…" />
          ) : queue.isError ? (
            <ErrorState
              title="Could not load the queue"
              error={queue.error}
              onRetry={() => void queue.refetch()}
            />
          ) : queue.data && queue.data.items.length > 0 ? (
            <>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.data.items.map((item) => (
                      <TableRow key={item.requestId}>
                        <TableCell>
                          <span className="font-semibold">{item.studentName}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                            {item.rollNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {certificateTypeLabel(item.certificateType)}
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
              <ul className="divide-y divide-border sm:hidden">
                {queue.data.items.map((item) => (
                  <li key={item.requestId}>
                    <Link
                      to={`/admin/requests/${item.requestId}`}
                      className="block py-4 transition-colors hover:bg-cream-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.studentName}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {item.rollNumber}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
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
            </>
          ) : (
            <EmptyState
              title="The queue is clear"
              description="There are no pending certificate requests. New student submissions will appear here."
              className="border-0 bg-transparent py-8"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
