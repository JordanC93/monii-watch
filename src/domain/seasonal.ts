/**
 * Seasonal-spending hint.
 *
 * "December was 32% higher than your monthly average over the last
 * year — bump categories by that for this December?" Picks the same
 * month one year ago vs the trailing 12-month average and surfaces a
 * one-tap apply when the deviation is meaningful (≥15%).
 */

import type { Account, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';

export type SeasonalHint = {
  /** YYYY-MM the hint applies to (i.e. the upcoming month). */
  month: string;
  /** Same month last year's outflow (cents, positive). */
  lastYearAmount: number;
  /** 12-month trailing average (cents, positive). */
  trailingAvg: number;
  /** Decimal — 0.32 = 32% higher than trailing. */
  deviation: number;
};

const THRESHOLD = 0.15;

export function detectSeasonalHint(
  txns: Transaction[],
  accounts: Account[],
  upcomingMonth: string,
  today: Date = new Date(),
): SeasonalHint | null {
  // Same month one year ago.
  const [yyyy, mm] = upcomingMonth.split('-');
  const lastYearMonth = `${parseInt(yyyy, 10) - 1}-${mm}`;
  // Trailing 12 months ending the month BEFORE upcomingMonth.
  const trailingEnd = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const trailingStart = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const onBudgetIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
  let lastYearTotal = 0;
  const monthly: Record<string, number> = {};
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.amount >= 0) continue;
    const m = t.date.slice(0, 7);
    if (m === lastYearMonth) lastYearTotal += -t.amount;
    if (m >= trailingStart && m <= trailingEnd) {
      monthly[m] = (monthly[m] ?? 0) + -t.amount;
    }
  }
  const months = Object.keys(monthly);
  if (months.length < 6 || lastYearTotal === 0) return null;
  const trailingAvg = Math.round(months.reduce((s, m) => s + monthly[m], 0) / months.length);
  if (trailingAvg === 0) return null;
  const deviation = (lastYearTotal - trailingAvg) / trailingAvg;
  if (Math.abs(deviation) < THRESHOLD) return null;
  return {
    month: upcomingMonth,
    lastYearAmount: lastYearTotal,
    trailingAvg,
    deviation,
  };
}
