/**
 * Pay-schedule math helpers. Pure functions — no React, no Yjs.
 *
 * The user picks a frequency (weekly / biweekly / semimonthly / monthly) and
 * an anchor date (any one known paycheck). We use that to (a) compute how
 * much a per-month figure works out to per-paycheck, and (b) project the
 * date of the next paycheck so progress widgets can say "$X to set aside on
 * your next paycheck (Apr 30)".
 */

import { addDays, addMonths, format, parseISO } from 'date-fns';
import type { Money, Settings } from './types';
import { DATE_FMT } from './date';

export type PayFrequency = Settings['payFrequency'];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  unset: 'Not set',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
};

/** Number of paychecks per year for each frequency. */
export function paychecksPerYear(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly':      return 52;
    case 'biweekly':    return 26;
    case 'semimonthly': return 24;
    case 'monthly':     return 12;
    case 'unset':       return 0;
  }
}

/**
 * Convert a per-month amount into a per-paycheck amount under the given
 * frequency. Rounds to the nearest cent. Returns 0 when frequency is unset.
 *
 *   weekly: monthly × 12 ÷ 52
 *   biweekly: monthly × 12 ÷ 26
 *   semimonthly: monthly ÷ 2
 *   monthly: monthly
 */
export function perPaycheckAmount(monthly: Money, freq: PayFrequency): Money {
  if (freq === 'unset') return 0;
  const perYear = monthly * 12;
  const checksPerYear = paychecksPerYear(freq);
  return Math.round(perYear / checksPerYear);
}

/**
 * Project the date of the next paycheck on or after `today`. Returns null
 * when frequency is unset or anchor date is empty.
 *
 * For semimonthly we treat the anchor's day-of-month as one pay day and
 * either day+15 (or day-15 if that overflows) as the other.
 */
export function nextPaycheck(settings: Pick<Settings, 'payFrequency' | 'payAnchorDate'>, todayIso: string): string | null {
  if (settings.payFrequency === 'unset') return null;
  if (!settings.payAnchorDate) return null;
  const today = parseISO(todayIso);
  const anchor = parseISO(settings.payAnchorDate);

  if (settings.payFrequency === 'monthly') {
    // Same day of month, rolling forward. Always add from the ORIGINAL
    // anchor so a clamped month (Jan 31 → Feb 28) doesn't drift the day.
    let d = anchor;
    for (let n = 1; d.getTime() < today.getTime(); n++) d = addMonths(anchor, n);
    return format(d, DATE_FMT);
  }
  if (settings.payFrequency === 'weekly' || settings.payFrequency === 'biweekly') {
    const stepDays = settings.payFrequency === 'weekly' ? 7 : 14;
    // Start from anchor and step forward (or back) until we land on/after today.
    let d = anchor;
    if (d.getTime() < today.getTime()) {
      const diff = (today.getTime() - d.getTime()) / 86400000;
      const steps = Math.ceil(diff / stepDays);
      d = addDays(d, steps * stepDays);
    } else if (d.getTime() > today.getTime() + 1000) {
      // Anchor is in the future — back off until just on/after today.
      const diff = (d.getTime() - today.getTime()) / 86400000;
      const steps = Math.floor(diff / stepDays);
      d = addDays(d, -steps * stepDays);
    }
    return format(d, DATE_FMT);
  }
  // Semimonthly: two pay days each month — the anchor's day, and that day + 15
  // (or day - 15 when day + 15 overflows the month).
  const day = anchor.getDate();
  // Try this month first.
  const here = today;
  const candidates: Date[] = [];
  for (const offset of [0, 1]) {
    const ym = new Date(here.getFullYear(), here.getMonth() + offset, 1);
    const lastDay = new Date(ym.getFullYear(), ym.getMonth() + 1, 0).getDate();
    const altDay = day + 15 <= lastDay ? day + 15 : day - 15 >= 1 ? day - 15 : lastDay;
    candidates.push(new Date(ym.getFullYear(), ym.getMonth(), Math.min(day, lastDay)));
    candidates.push(new Date(ym.getFullYear(), ym.getMonth(), altDay));
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const next = candidates.find((d) => d.getTime() >= today.getTime());
  return next ? format(next, DATE_FMT) : format(candidates[candidates.length - 1], DATE_FMT);
}
