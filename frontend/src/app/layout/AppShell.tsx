import { PropsWithChildren } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/app/layout/Sidebar';
import { Topbar } from '@/app/layout/Topbar';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-h-screen flex-col">
          <Topbar />
          <main className="flex-1 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
            {children || <Outlet />}
          </main>
        </div>
      </div>
    </div>
  );
}
