import { cn } from '../../lib/cn';
import { useFormatMoney } from '../../lib/format';
import { useBudget } from '../../store/budget';
import type { Money as MoneyT } from '../../domain/types';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { usePrivacy } from '../../lib/privacy';
import { useAnimatedValue } from '../../lib/useAnimatedValue';

type Props = {
  cents: MoneyT;
  className?: string;
  showSign?: boolean;
  /** if true, dim when zero */
  dimZero?: boolean;
  /** if true, do not auto-color positive/negative — let className handle it */
  monochrome?: boolean;
  /**
   * v0.7.29 — smoothly roll the digits from the previous value to the
   * new value over ~380 ms instead of snapping. Default off. Turn on
   * for high-signal numbers (Ready to Assign, account totals, net
   * worth) where the animation makes balance changes feel intentional.
   * Always respects `prefers-reduced-motion` — snaps immediately when
   * the user has motion reduced. Cheap: a single rAF loop per use.
   */
  animate?: boolean;
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
export function Money({ cents, className, showSign, dimZero = true, monochrome, animate = false }: Props) {
  const fmt = useFormatMoney();
  const userMode = useBudget((s) => s.settings.moneyColorMode);
  const useMono = monochrome ?? (userMode === 'monochrome');
  const privacy = usePrivacy();
  // v0.7.29 — smooth roll between values when `animate` is on. Falls
  // through to the same `cents` value when off (the hook is unconditional
  // because Rules of Hooks; cost is a single state slot). Rounded back
  // to the nearest cent before formatting so the format helper still
  // sees an integer-cents value (no half-cents in formatted output).
  const interpolated = useAnimatedValue(cents);
  const display = animate ? Math.round(interpolated) : cents;

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
        <span>{fmt(display, { showSign })}</span>
      </span>
    );
  }

  const tone = cents > 0 ? 'money-positive'
    : cents < 0 ? 'money-negative'
    : (dimZero ? 'money-zero' : '');
  return <span className={cn('tabular', tone, className)}>{fmt(display, { showSign })}</span>;
}
