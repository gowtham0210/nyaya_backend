import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

type BadgeProps = PropsWithChildren<{
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}>;

export function Badge({ children, tone = 'default' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'default' && 'bg-teal-50 text-teal-700',
        tone === 'success' && 'bg-emerald-50 text-emerald-700',
        tone === 'warning' && 'bg-amber-50 text-amber-700',
        tone === 'danger' && 'bg-red-50 text-red-700',
        tone === 'muted' && 'bg-slate-100 text-slate-600'
      )}
    >
      {children}
    </span>
  );
}
