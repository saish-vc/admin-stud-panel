import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FieldError } from '@/components/common/Form';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/lib/api';

const schema = z.object({
  rollNumber: z
    .string()
    .trim()
    .min(4, 'Enter your NTTF roll number.')
    .max(20, 'Roll numbers are at most 20 characters.')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only.'),
  password: z.string().min(1, 'Enter your password.').max(128),
});

type FormValues = z.infer<typeof schema>;

function destinationFor(role: string, from: string | undefined): string {
  if (
    from &&
    ((role === 'STUDENT' && from.startsWith('/student')) ||
      (role !== 'STUDENT' && from.startsWith('/admin')))
  ) {
    return from;
  }
  return role === 'STUDENT' ? '/student' : '/admin';
}

export function StudentLoginPage() {
  const { loginStudent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [apiError, setApiError] = React.useState<ApiError | null>(null);
  const from = (location.state as { from?: string } | null)?.from;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rollNumber: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    try {
      const user = await loginStudent(values.rollNumber.toUpperCase(), values.password);
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      navigate(destinationFor(user.role, from), { replace: true });
    } catch (error) {
      setApiError(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the portal. Check your connection.'),
      );
    }
  });

  return (
    <AuthShell
      eyebrow="Student sign in"
      title="Welcome back"
      description="Sign in with the roll number and temporary password issued by NTTF."
      footer={
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            NTTF staff member?{' '}
            <Link
              to="/admin/login"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Use the staff sign-in
            </Link>
          </p>
          <p>
            Need to check a certificate instead?{' '}
            <Link
              to="/verify"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Verify a certificate
            </Link>
          </p>
        </div>
      }
    >
      {apiError ? (
        <Alert className="mb-5 border-red-200 bg-red-50 text-red-950">
          <AlertTitle>
            {apiError.status === 429 ? 'Too many attempts' : 'Sign-in failed'}
          </AlertTitle>
          <AlertDescription>
            {apiError.status === 429
              ? 'Please wait a minute before trying again.'
              : apiError.status === 401
                ? 'The roll number or password is incorrect.'
                : apiError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="rollNumber">Roll number</Label>
          <Input
            id="rollNumber"
            data-testid="student-roll-number"
            autoComplete="username"
            autoCapitalize="characters"
            placeholder="NTTF2026001"
            className="mt-1.5 font-mono uppercase"
            aria-invalid={Boolean(errors.rollNumber)}
            aria-describedby={errors.rollNumber ? 'rollNumber-error' : undefined}
            {...register('rollNumber')}
          />
          <FieldError id="rollNumber-error" message={errors.rollNumber?.message} />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1.5">
            <Input
              id="password"
              data-testid="student-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="pr-12"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          data-testid="student-login-submit"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting ? <LogIn className="h-4 w-4" aria-hidden="true" /> : null}
        </Button>
      </form>

      <div className="mt-5 rounded-lg border border-border bg-cream-50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        First sign-in? Use the temporary password provided by the certificate office. You will be
        asked to create a new password immediately.
      </div>
    </AuthShell>
  );
}
