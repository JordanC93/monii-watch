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

// v0.7.29 — fully rounded pills for every size, matching iOS 17 / iOS 26
// system buttons. Same radius across all themes for predictability —
// Apple's modern UIKit + SwiftUI defaults all use capsule shape, and a
// uniform pill makes future visual tweaks safer (no theme-specific
// shape drift). `rounded-full` makes Tailwind apply a 9999 px radius,
// which the browser clamps to half the element's height → true pill
// for text buttons, true circle for the icon-only variant. Horizontal
// padding bumped slightly so the rounded ends don't crowd the label
// (a pill needs more breathing room on the sides than a rectangle).
const sizes: Record<Size, string> = {
  sm: 'h-7 px-3 text-[12.5px] rounded-full',
  md: 'h-9 px-4 text-[13.5px] rounded-full',
  lg: 'h-11 px-6 text-[14.5px] rounded-full',
};

// Icon-only buttons stay square-aspect; rounded-full makes them
// circular by default (height = width = radius). Same Apple
// convention as iOS Photos / Reminders toolbar circles.
const iconSizes: Record<Size, string> = {
  sm: 'h-7 w-7 rounded-full',
  md: 'h-9 w-9 rounded-full',
  lg: 'h-11 w-11 rounded-full',
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
