import { PropsWithChildren } from 'react';
import { Card } from '@/components/ui/Card';

type StatCardProps = PropsWithChildren<{
  label: string;
  value: string;
}>;

export function StatCard({ label, value, children }: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
