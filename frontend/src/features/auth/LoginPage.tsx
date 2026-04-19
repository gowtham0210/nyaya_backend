import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { APP_TITLE } from '@/lib/config';
import { getErrorMessage } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Enter a valid admin email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const manualSchema = z.object({
  token: z.string().min(20, 'Paste a valid bearer token'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type ManualFormValues = z.infer<typeof manualSchema>;

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const showManualToken = searchParams.get('devMode') === '1';

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onChange',
  });

  const manualForm = useForm<ManualFormValues>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      token: '',
    },
    mode: 'onChange',
  });

  const redirectTarget = useMemo(() => {
    return location.state?.from || '/dashboard';
  }, [location.state]);

  async function onLogin(values: LoginFormValues) {
    try {
      await auth.login({
        email: values.email,
        password: values.password,
      });
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      loginForm.setError('root', {
        message: getErrorMessage(error),
      });
    }
  }

  async function onManualLogin(values: ManualFormValues) {
    try {
      await auth.loginWithManualToken(values.token);
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      manualForm.setError('root', {
        message: getErrorMessage(error),
      });
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_460px]">
        <div className="flex flex-col justify-between rounded-[32px] border border-white/10 bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-8 text-white shadow-2xl">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <ShieldCheck className="h-5 w-5 text-teal-300" />
              <span className="text-sm font-semibold tracking-wide text-teal-100">{APP_TITLE}</span>
            </div>

            <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-tight">
              Professional content management for quizzes, questions, options, and gamification.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              This portal replaces the original single-screen admin tool with a routed workspace for
              content teams. Sign in with an admin account to manage categories, quizzes, questions,
              bulk imports, levels, and leaderboards.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-teal-100">Secure session flow</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Access tokens stay in memory and refresh through secure cookie-based rotation.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-teal-100">Built for non-technical editors</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Guided forms, drafts, validation, bulk uploads, and dashboard insight are all in one
                place.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <Card className="w-full p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Admin sign-in</p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-500">
                Use your admin email and password. The portal will restore the session automatically on
                refresh when the secure cookie is present.
              </p>
            </div>

            {searchParams.get('reason') === 'session_expired' ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Your previous session expired. Sign in again to continue.
              </div>
            ) : null}

            <form className="mt-8 grid gap-5" onSubmit={loginForm.handleSubmit(onLogin)}>
              <Field label="Admin email" error={loginForm.formState.errors.email?.message}>
                <Input type="email" placeholder="admin@example.com" {...loginForm.register('email')} />
              </Field>

              <Field label="Password" error={loginForm.formState.errors.password?.message}>
                <Input type="password" placeholder="Your password" {...loginForm.register('password')} />
              </Field>

              {loginForm.formState.errors.root?.message ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loginForm.formState.errors.root.message}
                </div>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={loginForm.formState.isSubmitting || !loginForm.formState.isValid}
              >
                {loginForm.formState.isSubmitting ? 'Signing in...' : 'Login to admin portal'}
              </Button>
            </form>

            {showManualToken ? (
              <form className="mt-8 border-t border-slate-200 pt-6" onSubmit={manualForm.handleSubmit(onManualLogin)}>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">Developer manual token mode</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Available only when `?devMode=1` is present. Useful for QA and token debugging.
                  </p>
                </div>
                <Field label="Access token" error={manualForm.formState.errors.token?.message}>
                  <Textarea rows={6} placeholder="Paste a valid bearer token" {...manualForm.register('token')} />
                </Field>
                {manualForm.formState.errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {manualForm.formState.errors.root.message}
                  </div>
                ) : null}
                <Button
                  type="submit"
                  variant="secondary"
                  className="mt-4 w-full"
                  disabled={manualForm.formState.isSubmitting || !manualForm.formState.isValid}
                >
                  {manualForm.formState.isSubmitting ? 'Validating token...' : 'Use manual token'}
                </Button>
              </form>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
