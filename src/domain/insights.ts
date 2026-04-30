/**
 * Per-category spending insights — surfaced as inline badges on
 * budget rows ("38% above 6-mo avg") and elsewhere.
 *
 * Pure compute over `transactions[]`; no schema, no caching needed
 * (cheap enough to recompute on every render with a useMemo).
 */

import type { Account, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type CategoryInsight = {
  /** Cents spent THIS month in this category. */
  thisMonth: Money;
  /** Trailing average (excluding the current month). */
  trailingAvg: Money;
  /** Months counted in the trailing average. */
  monthsCounted: number;
  /** Pct change vs trailing avg, signed. e.g. +38 means 38% above; -22 means 22% below. */
  deltaPct: number;
  /** Categorical band: 'high' (≥+25%), 'low' (≤-25%), 'normal' (±25%), 'new' (<2 months of history). */
  band: 'high' | 'low' | 'normal' | 'new';
};

/** Compute insight for ONE category for the current month vs the
 *  preceding `lookbackMonths` months. */
export function computeCategoryInsight(
  categoryId: string,
  accounts: Account[],
  txns: Transaction[],
  thisMonthIso: string,
  lookbackMonths = 6,
): CategoryInsight {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );

  const monthsBack = monthRange(thisMonthIso, lookbackMonths);
  const cutoff = monthsBack[monthsBack.length - 1]; // earliest month in the window
  const trailingTotalsByMonth = new Map<string, number>();
  let thisMonthSpent = 0;

  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    // Tier 6 #9 — exclude one-time outliers from category averages.
    if (t.oneTime) continue;
    const m = t.date.slice(0, 7);
    if (m < cutoff || m > thisMonthIso) continue;
    for (const part of categoriesTouched(t)) {
      if (part.categoryId !== categoryId) continue;
      if (part.amount >= 0) continue; // outflows only
      const spent = -part.amount;
      if (m === thisMonthIso) thisMonthSpent += spent;
      else trailingTotalsByMonth.set(m, (trailingTotalsByMonth.get(m) ?? 0) + spent);
    }
  }

  const monthsCounted = trailingTotalsByMonth.size;
  const trailingTotal = [...trailingTotalsByMonth.values()].reduce((a, b) => a + b, 0);
  const trailingAvg = monthsCounted > 0 ? Math.round(trailingTotal / monthsCounted) : 0;

  let deltaPct = 0;
  if (trailingAvg > 0) {
    deltaPct = Math.round(((thisMonthSpent - trailingAvg) / trailingAvg) * 100);
  } else if (thisMonthSpent > 0) {
    deltaPct = 100; // technically infinite — display as "100%+" upstream
  }

  let band: CategoryInsight['band'];
  if (monthsCounted < 2) band = 'new';
  else if (deltaPct >= 25) band = 'high';
  else if (deltaPct <= -25) band = 'low';
  else band = 'normal';

  return { thisMonth: thisMonthSpent, trailingAvg, monthsCounted, deltaPct, band };
}

function monthRange(thisMonth: string, lookback: number): string[] {
  const [y, m] = thisMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= lookback; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
