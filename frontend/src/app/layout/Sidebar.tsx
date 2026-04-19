import { NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { navigationSections } from '@/app/navigation';

export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-shell px-4 py-6 text-slate-100 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-5">
      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-300">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-slate-200">Nyaya Admin</p>
          <p className="text-xs text-slate-400">Content and gamification portal</p>
        </div>
      </div>

      <nav className="space-y-8">
        {navigationSections.map((section) => (
          <div key={section.label}>
            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {section.label}
            </p>
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;

                if (item.disabled) {
                  return (
                    <div
                      key={item.path}
                      className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm text-slate-500"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? <Badge tone="muted">{item.badge}</Badge> : null}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm transition',
                        isActive
                          ? 'bg-white text-shell shadow-lg'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge ? <Badge tone="muted">{item.badge}</Badge> : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
