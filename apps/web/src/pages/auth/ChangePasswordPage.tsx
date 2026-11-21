import * as React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FieldError } from '@/components/common/Form';
import { FullPageLoader } from '@/components/common/Feedback';
import { useToast } from '@/components/common/Toast';
import { homePathForRole, useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .max(128, 'Use at most 128 characters.')
      .regex(/[a-z]/, 'Include a lowercase letter.')
      .regex(/[A-Z]/, 'Include an uppercase letter.')
      .regex(/\d/, 'Include a number.')
      .regex(/[^A-Za-z0-9]/, 'Include a symbol.'),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match.',
  })
  .refine((values) => values.currentPassword !== values.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password that differs from your current password.',
  });

type FormValues = z.infer<typeof schema>;

const RULES = [
  { label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /\d/.test(value) },
  { label: 'A symbol', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

function PasswordInput({
  id,
  autoComplete,
  hasError,
  describedBy,
  registration,
}: {
  id: string;
  autoComplete: string;
  hasError: boolean;
  describedBy?: string;
  registration: ReturnType<ReturnType<typeof useForm<FormValues>>['register']>;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative mt-1.5">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        className="pr-12"
        aria-invalid={hasError}
        aria-describedby={describedBy}
        {...registration}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={visible ? `Hide ${id}` : `Show ${id}`}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ChangePasswordPage() {
  const { status, user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [apiError, setApiError] = React.useState<ApiError | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword');

  if (status === 'loading') return <FullPageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast({
        title: 'Password updated',
        description: 'Your new password is active. Keep it private.',
        variant: 'success',
      });
      navigate(homePathForRole(user.role), { replace: true });
    } catch (error) {
      setApiError(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the portal. Check your connection.'),
      );
    }
  });

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="container flex min-h-screen items-center py-10 focus:outline-none"
    >
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-lift sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-gold-600/25 bg-gold-50 text-gold-700">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-navy-900">
            {user.mustChangePassword ? 'Create your password' : 'Change your password'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {user.mustChangePassword
              ? 'You signed in with a temporary password. Choose a private password to unlock your workspace.'
              : 'Choose a strong password that you do not use anywhere else.'}
          </p>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-cream-50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" aria-hidden="true" />
            Changing your password signs out other active sessions on this account.
          </div>

          {apiError ? (
            <Alert className="mt-5 border-red-200 bg-red-50 text-red-950">
              <AlertTitle>Password not changed</AlertTitle>
              <AlertDescription>
                {apiError.status === 401 ? 'Your current password is incorrect.' : apiError.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                hasError={Boolean(errors.currentPassword)}
                describedBy={errors.currentPassword ? 'current-password-error' : undefined}
                registration={register('currentPassword')}
              />
              <FieldError id="current-password-error" message={errors.currentPassword?.message} />
            </div>

            <div>
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                hasError={Boolean(errors.newPassword)}
                describedBy={errors.newPassword ? 'new-password-error' : 'password-rules'}
                registration={register('newPassword')}
              />
              <FieldError id="new-password-error" message={errors.newPassword?.message} />
              <ul id="password-rules" className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {RULES.map((rule) => {
                  const passed = rule.test(newPassword);
                  return (
                    <li
                      key={rule.label}
                      className={cn(
                        'flex items-center gap-1.5 text-xs',
                        passed ? 'font-semibold text-success-700' : 'text-muted-foreground',
                      )}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5', passed ? 'opacity-100' : 'opacity-30')}
                        aria-hidden="true"
                      />
                      {rule.label}
                      <span className="sr-only">{passed ? ' (met)' : ' (not met)'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                hasError={Boolean(errors.confirmPassword)}
                describedBy={errors.confirmPassword ? 'confirm-password-error' : undefined}
                registration={register('confirmPassword')}
              />
              <FieldError id="confirm-password-error" message={errors.confirmPassword?.message} />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password…' : 'Update password'}
            </Button>
          </form>

          {!user.mustChangePassword ? (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              <Link
                to={homePathForRole(user.role)}
                className="font-semibold text-primary hover:underline"
              >
                Return to dashboard
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
