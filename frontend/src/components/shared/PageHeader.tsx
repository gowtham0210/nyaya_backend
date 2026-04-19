import { PropsWithChildren } from 'react';
import { Button } from '@/components/ui/Button';

type PageHeaderProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}>;

export function PageHeader({ eyebrow, title, description, actionLabel, onAction, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-panel lg:flex-row lg:items-center lg:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {children}
        {actionLabel ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      </div>
    </div>
  );
}
