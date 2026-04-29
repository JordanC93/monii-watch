import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { ChevronDown } from 'lucide-react';

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-9 pl-3 pr-9 rounded-lg bg-surface-2 border border-border text-fg appearance-none',
          'focus:bg-surface-3 focus:border-accent transition-colors w-full',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-fg-subtle" />
    </div>
  );
});
