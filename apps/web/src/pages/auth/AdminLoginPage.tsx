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
  email: z.string().trim().email('Enter a valid staff email address.').max(100),
  password: z.string().min(1, 'Enter your password.').max(128),
});

type FormValues = z.infer<typeof schema>;

export function AdminLoginPage() {
  const { loginAdmin } = useAuth();
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
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    try {
      const user = await loginAdmin(values.email, values.password);
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      const destination = from && from.startsWith('/admin') ? from : '/admin';
      navigate(destination, { replace: true });
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
      eyebrow="Staff sign in"
      title="Administration sign in"
      description="For NTTF verification clerks, Heads of Department, and super administrators."
      variant="admin"
      footer={
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Student looking for your certificates?{' '}
            <Link
              to="/login"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Go to student sign in
            </Link>
          </p>
          <p className="text-xs">
            Staff accounts are provisioned by the super administrator. Do not share credentials.
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
              : apiError.status === 401 || apiError.status === 403
                ? 'The email or password is incorrect, or this account is not active.'
                : apiError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="email">Staff email</Label>
          <Input
            id="email"
            data-testid="admin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="name@nttf.ac.in"
            className="mt-1.5"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1.5">
            <Input
              id="password"
              data-testid="admin-password"
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
          data-testid="admin-login-submit"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in to administration'}
          {!isSubmitting ? <LogIn className="h-4 w-4" aria-hidden="true" /> : null}
        </Button>
      </form>
    </AuthShell>
  );
}
