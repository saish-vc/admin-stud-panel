import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, KeyRound, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, PageLoader } from '@/components/common/Feedback';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import type { StudentProfile } from '@/types';

export function StudentProfilePage() {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ['student', 'profile'],
    queryFn: () => api.get<StudentProfile>('/api/student/profile'),
  });

  const data = profile.data;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="My profile"
        title="Student record"
        description="Your academic details are maintained by NTTF. Contact the certificate office if any information is incorrect."
        icon={UserRound}
      />

      {profile.isPending ? (
        <PageLoader label="Loading your record…" />
      ) : profile.isError ? (
        <ErrorState
          title="Could not load your profile"
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
                <span
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-navy-900 font-display text-xl font-semibold text-cream-50"
                  aria-hidden="true"
                >
                  {initials(data.fullName)}
                </span>
                <div>
                  <h2 className="font-display text-2xl font-semibold text-navy-900">
                    {data.fullName}
                  </h2>
                  <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                    {data.rollNumber}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={data.status === 'ACTIVE' ? 'success' : 'outline'}>
                      {data.status.charAt(0) + data.status.slice(1).toLowerCase()}
                    </Badge>
                    <Badge variant="gold">Batch {data.batchYear}</Badge>
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <ProfileField label="Programme" value={data.programme} />
                <ProfileField
                  label="Current semester"
                  value={
                    data.currentSemester ? `Semester ${data.currentSemester}` : 'Not applicable'
                  }
                />
                <ProfileField
                  label="Date of birth"
                  value={formatDate(data.dateOfBirth)}
                  icon={CalendarDays}
                />
                <ProfileField label="Enrolled on" value={formatDate(data.createdAt)} />
                <ProfileField label="Email" value={data.email} icon={Mail} />
                <ProfileField label="Phone" value={data.phone ?? 'Not recorded'} icon={Phone} />
              </dl>

              <div className="mt-7 rounded-xl border border-border bg-cream-50/70 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-gold-600" aria-hidden="true" />
                  Record accuracy
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Certificate PDFs use the name, roll number, programme, and batch shown here. If a
                  detail needs correction, resolve it with the certificate office before requesting
                  a certificate.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4 text-gold-600" aria-hidden="true" />
                  Account security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Use a unique password with upper and lowercase letters, a number, and a symbol.
                  Changing it signs out your other sessions.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/change-password">Change password</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign-in details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Account
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs break-all">
                      {user?.email ?? data.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Access level
                    </dt>
                    <dd className="mt-0.5 font-semibold">Student</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Session
                    </dt>
                    <dd className="mt-0.5 font-semibold">Expires automatically when inactive</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof CalendarDays;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-gold-600" aria-hidden="true" /> : null}
        <span className="break-all">{value}</span>
      </dd>
    </div>
  );
}
