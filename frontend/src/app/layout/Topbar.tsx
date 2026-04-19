import { Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { routeTitles } from '@/app/navigation';

export function Topbar() {
  const location = useLocation();
  const auth = useAuth();
  const routeMeta = routeTitles[location.pathname] || {
    title: 'Nyaya Admin Portal',
    breadcrumb: 'Portal',
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {routeMeta.breadcrumb}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{routeMeta.title}</h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-teal-500 focus:bg-white sm:w-72"
              placeholder="Search module names, records, or routes"
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{auth.user?.fullName || 'Admin user'}</p>
              <p className="text-xs text-slate-500">{auth.user?.email || 'Not signed in'}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={auth.logout}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
