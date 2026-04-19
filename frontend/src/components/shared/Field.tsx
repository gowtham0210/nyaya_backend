import { PropsWithChildren } from 'react';

type FieldProps = PropsWithChildren<{
  label: string;
  error?: string;
  hint?: string;
}>;

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-700">{label}</span>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}
