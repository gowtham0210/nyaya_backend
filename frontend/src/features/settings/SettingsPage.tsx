import { useAuth } from '@/app/providers/AuthProvider';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { API_BASE_URL } from '@/lib/config';
import { formatDateTime } from '@/lib/utils';

export function SettingsPage() {
  const auth = useAuth();
  const missingValue = 'Not available';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Portal configuration"
        description="Operational details for the current session, environment wiring, and staged roadmap notes."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Session</h3>
          <dl className="mt-5 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Status</dt>
              <dd className="mt-1 text-slate-900">{auth.status}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">User</dt>
              <dd className="mt-1 text-slate-900">{auth.user?.fullName || missingValue}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Email</dt>
              <dd className="mt-1 text-slate-900">{auth.user?.email || missingValue}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Role</dt>
              <dd className="mt-1 text-slate-900">{auth.role || missingValue}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Account created</dt>
              <dd className="mt-1 text-slate-900">{formatDateTime(auth.user?.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Environment</h3>
          <dl className="mt-5 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">API base URL</dt>
              <dd className="mt-1 break-all text-slate-900">{API_BASE_URL}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Auth model</dt>
              <dd className="mt-1 text-slate-900">Cookie-based refresh token rotation with in-memory access tokens</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Portal modules enabled today</dt>
              <dd className="mt-1 text-slate-900">
                Dashboard, Categories, Quizzes, Questions, Bulk Import, Levels, Leaderboards
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Deferred modules</dt>
              <dd className="mt-1 text-slate-900">
                Users and Attempts remain behind backend admin endpoint dependencies.
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
