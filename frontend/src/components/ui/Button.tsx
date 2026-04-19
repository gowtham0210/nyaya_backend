import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-medium transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-9 px-4 text-sm' : 'h-11 px-5 text-sm',
        variant === 'primary' && 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-100',
        variant === 'secondary' &&
          'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-100',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 focus:ring-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-100',
        className
      )}
      {...props}
    />
  );
}
