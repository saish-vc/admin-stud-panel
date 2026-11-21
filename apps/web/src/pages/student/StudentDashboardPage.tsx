import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  PlusCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader, ErrorState, EmptyState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { certificateTypeLabel, formatDate, initials, pluralise } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import type { Paginated, StudentProfile, StudentRequest } from '@/types';

export function StudentDashboardPage() {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ['student', 'profile'],
    queryFn: () => api.get<StudentProfile>('/api/student/profile'),
  });
  const requests = useQuery({
    queryKey: ['student', 'requests', 1, 5],
    queryFn: () => api.get<Paginated<StudentRequest>>('/api/student/requests?page=1&limit=5'),
  });

  const firstName = (profile.data?.fullName ?? user?.name ?? 'Student').split(/\s+/)[0];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Student overview"
        title={`Welcome back, ${firstName}`}
        description="Track your certificate requests, respond to reviewer feedback, and download issued PDFs."
        icon={LayoutDashboard}
        actions={
          <Button asChild>
            <Link to="/student/new">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              New request
            </Link>
          </Button>
        }
      />

      <section
        aria-label="Student summary"
        className="surface-grid overflow-hidden rounded-2xl bg-navy-950 px-6 py-7 text-cream-50 shadow-lift sm:px-8"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-white/15 bg-gold-500/15 font-display text-lg font-semibold text-gold-400"
              aria-hidden="true"
            >
              {initials(profile.data?.fullName ?? user?.name ?? 'Student')}
            </span>
            <div>
              <p className="font-display text-xl font-semibold">
                {profile.data?.fullName ?? user?.name}
              </p>
              <p className="mt-0.5 text-sm text-cream-100/65">
                {profile.data?.rollNumber ?? user?.rollNumber ?? '—'} ·{' '}
                {profile.data?.programme ?? user?.programme ?? 'NTTF student'}
              </p>
              <p className="mt-1 text-xs text-cream-100/70">
                Batch {profile.data?.batchYear ?? '—'}
                {profile.data?.currentSemester ? ` · Semester ${profile.data.currentSemester}` : ''}
                {profile.data?.status ? ` · ${profile.data.status}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-cream-100/70">
                  Total requests
                </dt>
                <dd className="mt-1 font-display text-2xl font-semibold">
                  {requests.data?.total ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-cream-100/70">
                  Open request limit
                </dt>
                <dd className="mt-1 text-sm font-semibold">3 at a time</dd>
              </div>
            </dl>
            <div className="hidden h-10 w-px bg-white/10 sm:block" />
            <Button asChild variant="accent" size="sm">
              <Link to="/student/requests">
                View all requests
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Recent requests</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/requests">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {requests.isPending ? (
              <PageLoader label="Loading your requests…" />
            ) : requests.isError ? (
              <ErrorState
                title="Could not load your requests"
                error={requests.error}
                onRetry={() => void requests.refetch()}
              />
            ) : requests.data && requests.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {requests.data.items.map((request) => (
                  <li key={request.requestId}>
                    <Link
                      to={`/student/requests/${request.requestId}`}
                      className="group flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold group-hover:text-primary">
                          {certificateTypeLabel(request.certificateType)}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {request.purpose}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Submitted {formatDate(request.createdAt)}
                          {request.certificate ? ' · PDF ready' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusBadge status={request.status} />
                        <ArrowRight
                          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No requests yet"
                description="Start your first certificate request and track it through verification and approval."
                action={
                  <Button asChild>
                    <Link to="/student/new">
                      <PlusCircle className="h-4 w-4" aria-hidden="true" />
                      Create a request
                    </Link>
                  </Button>
                }
                className="border-0 bg-transparent py-8"
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-4 w-4 text-gold-600" aria-hidden="true" />
                Your record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.isPending ? (
                <PageLoader label="Loading profile…" />
              ) : profile.isError ? (
                <ErrorState
                  title="Profile unavailable"
                  error={profile.error}
                  onRetry={() => void profile.refetch()}
                />
              ) : profile.data ? (
                <>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Roll number</dt>
                      <dd className="font-mono text-xs font-semibold">{profile.data.rollNumber}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Programme</dt>
                      <dd className="max-w-[60%] text-right font-semibold">
                        {profile.data.programme}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Batch</dt>
                      <dd className="font-semibold">{profile.data.batchYear}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Date of birth</dt>
                      <dd className="inline-flex items-center gap-1.5 font-semibold">
                        <CalendarDays className="h-3.5 w-3.5 text-gold-600" aria-hidden="true" />
                        {formatDate(profile.data.dateOfBirth)}
                      </dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/student/profile">View full profile</Link>
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-gold-600/20 bg-gold-50/50">
            <CardContent className="p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-500 text-white">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-3 font-display text-lg font-semibold">
                Which certificate do I need?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Bonafide for current enrolment, leaving certificate after a programme, and diploma
                for awarded qualifications.
              </p>
              <Link
                to="/student/new"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Choose a certificate
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-border bg-card p-5 text-sm shadow-card">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-gold-600" aria-hidden="true" />
              Secure by design
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              You currently have{' '}
              {pluralise(
                requests.data?.items.filter((item) => item.status === 'READY').length ?? 0,
                'ready certificate',
              )}{' '}
              among your latest requests. Streams are authorised per account and audited.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeCheck className="h-4 w-4 text-gold-600" aria-hidden="true" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Submitted', 'Your request enters the queue.'],
              ['Under verification', 'A clerk validates your documents.'],
              ['Approved', 'The HOD approves issuance.'],
              ['Ready', 'Download your signed PDF.'],
            ].map(([title, text], index) => (
              <li key={title} className="rounded-lg border border-border bg-cream-50/60 p-4">
                <span className="text-xs font-bold text-gold-600">Step {index + 1}</span>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
