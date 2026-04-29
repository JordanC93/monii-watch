import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, invalid, ...rest }, ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 px-3 rounded-lg bg-surface-2 border border-border text-fg placeholder:text-fg-subtle',
        'focus:bg-surface-3 focus:border-accent transition-colors',
        invalid && 'border-negative',
        className,
      )}
      {...rest}
    />
  );
});
