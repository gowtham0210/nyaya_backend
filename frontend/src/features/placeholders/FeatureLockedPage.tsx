import { LockKeyhole } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type FeatureLockedPageProps = {
  title: string;
  description: string;
};

export function FeatureLockedPage({ title, description }: FeatureLockedPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-2xl p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
      </Card>
    </div>
  );
}
