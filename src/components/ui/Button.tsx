import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** show as icon-only square */
  iconOnly?: boolean;
};

const variants: Record<Variant, string> = {
  primary:   'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 disabled:opacity-50',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-border disabled:opacity-50',
  ghost:     'text-fg-muted hover:text-fg hover:bg-surface-2 disabled:opacity-50',
  danger:    'bg-negative text-white hover:brightness-110 active:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] rounded-md',
  md: 'h-9 px-3.5 text-[13.5px] rounded-lg',
  lg: 'h-11 px-5 text-[14.5px] rounded-lg',
};

const iconSizes: Record<Size, string> = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', iconOnly, className, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium select-none transition active:translate-y-px',
        iconOnly ? iconSizes[size] : sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
