import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Props = {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';
};

const tones = {
  neutral:  'bg-surface-3 text-fg-muted',
  accent:   'bg-accent/15 text-accent',
  positive: 'bg-positive/15 text-positive',
  negative: 'bg-negative/15 text-negative',
  warning:  'bg-warning/15 text-warning',
};

export function Badge({ children, className, tone = 'neutral' }: Props) {
  return (
    <span className={cn('inline-flex items-center px-1.5 h-5 rounded text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
