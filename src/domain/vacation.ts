/**
 * Vacation mode helpers.
 *
 * - `isOnVacation(today, settings)`: are we currently in a vacation window?
 * - `vacationSummaryStats`: pure computation of "what was spent + what
 *   auto-cover did" for the just-ended vacation period.
 *
 * The auto-cover daily fire is triggered from `notify.ts` (or main.tsx)
 * — it's the same `coverOverspending` call the alert banner uses, just
 * scheduled to run once per day during the window.
 */

import type { Settings, Account, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { isoBetween, todayIso } from './date';

export function isOnVacation(settings: Settings, today: string = todayIso()): boolean {
  const v = settings.vacationMode;
  if (!v || !v.startDate || !v.endDate) return false;
  return isoBetween(today, v.startDate, v.endDate);
}

export function vacationEnded(settings: Settings, today: string = todayIso()): boolean {
  const v = settings.vacationMode;
  if (!v || !v.startDate || !v.endDate) return false;
  return today > v.endDate;
}

export type VacationStats = {
  startDate: string;
  endDate: string;
  /** Total outflow in the window in cents (positive). */
  spent: number;
  /** Total inflow in the window. */
  inflow: number;
  /** Daily average outflow. */
  dailyAverage: number;
  /** Number of transactions. */
  txnCount: number;
  /** Top categories (by spend), max 5. */
  topCategories: Array<{ categoryId: string; spent: number }>;
};

export function vacationSummaryStats(
  settings: Settings,
  txns: Transaction[],
  accounts: Account[],
): VacationStats | null {
  const v = settings.vacationMode;
  if (!v || !v.startDate || !v.endDate) return null;
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  let spent = 0;
  let inflow = 0;
  let count = 0;
  const byCat = new Map<string, number>();
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (!isoBetween(t.date, v.startDate, v.endDate)) continue;
    count++;
    if (t.amount < 0) {
      spent += -t.amount;
      if (t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + -t.amount);
    } else if (t.amount > 0) {
      inflow += t.amount;
    }
  }
  const days = Math.max(1, daysBetween(v.startDate, v.endDate) + 1);
  const topCategories = Array.from(byCat.entries())
    .map(([categoryId, s]) => ({ categoryId, spent: s }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);
  return {
    startDate: v.startDate,
    endDate: v.endDate,
    spent,
    inflow,
    dailyAverage: Math.round(spent / days),
    txnCount: count,
    topCategories,
  };
}

function daysBetween(a: string, b: string): number {
  const A = new Date(a + 'T00:00:00').getTime();
  const B = new Date(b + 'T00:00:00').getTime();
  return Math.round((B - A) / 86400000);
}
