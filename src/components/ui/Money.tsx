import { cn } from '../../lib/cn';
import { useFormatMoney } from '../../lib/format';
import { useBudget } from '../../store/budget';
import type { Money as MoneyT } from '../../domain/types';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { usePrivacy } from '../../lib/privacy';

type Props = {
  cents: MoneyT;
  className?: string;
  showSign?: boolean;
  /** if true, dim when zero */
  dimZero?: boolean;
  /** if true, do not auto-color positive/negative — let className handle it */
  monochrome?: boolean;
};

/**
 * Money display component.
 *
 * Two color modes, controlled by `Settings.moneyColorMode`:
 *
 *   `default` (the YNAB / Quicken look) — green for positive, red for
 *     negative, dim for zero. Strong visual feedback.
 *   `monochrome` — no color; just leading +/− sign + a tiny arrow icon.
 *     Some users find the constant red feedback stressful and prefer
 *     a calmer presentation.
 *
 * The per-call `monochrome` prop overrides the setting for individual
 * usages where coloring still helps (e.g. money color in a filter chip).
 */
export function Money({ cents, className, showSign, dimZero = true, monochrome }: Props) {
  const fmt = useFormatMoney();
  const userMode = useBudget((s) => s.settings.moneyColorMode);
  const useMono = monochrome ?? (userMode === 'monochrome');
  const privacy = usePrivacy();

  if (privacy) {
    // Blur the whole amount; preserve width so layout doesn't jump.
    return (
      <span
        className={cn('tabular select-none', className)}
        aria-label="hidden"
        style={{ filter: 'blur(7px)', letterSpacing: '0.05em' }}
      >
        {fmt(cents, { showSign }).replace(/[\d.,$€£¥₹\-]/g, '•')}
      </span>
    );
  }

  if (useMono) {
    // Monochrome mode: the sign is the signal. Use a small arrow icon
    // for non-zero values so the direction is unmistakable even without
    // color — mirrors what stock tickers do for accessibility.
    const isUp = cents > 0;
    const isDown = cents < 0;
    const isZero = cents === 0;
    return (
      <span className={cn('tabular inline-flex items-center gap-0.5', isZero && dimZero && 'text-fg-subtle', className)}>
        {isUp && <ArrowUp size={11} className="opacity-70" aria-label="positive" />}
        {isDown && <ArrowDown size={11} className="opacity-70" aria-label="negative" />}
        <span>{fmt(cents, { showSign })}</span>
      </span>
    );
  }

  const tone = cents > 0 ? 'money-positive'
    : cents < 0 ? 'money-negative'
    : (dimZero ? 'money-zero' : '');
  return <span className={cn('tabular', tone, className)}>{fmt(cents, { showSign })}</span>;
}
