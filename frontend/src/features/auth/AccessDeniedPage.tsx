import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-xl p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900">Admin access required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Your account is authenticated, but it does not carry the `admin` role required for the Nyaya
          admin portal. Ask the API team to add your email to the admin allow-list before trying again.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Return to login
          </Link>
        </div>
      </Card>
    </div>
  );
}
