/**
 * Spending streaks. Per-category, count of consecutive months where
 * the category came in at-or-under its `assigned` value (i.e. didn't
 * overspend). A motivating signal — "stayed under Dining for 3 months
 * in a row".
 *
 * Definition:
 *   - Walk months backward from `thisMonth - 1` (current month is in
 *     progress, doesn't count as a completed streak month yet)
 *   - Stop at the first month where activity > assigned (overspent)
 *     OR where assigned was 0 (no budget set)
 *   - Streak length = count of qualifying consecutive months
 */

import type { Account, Category, MonthAssignment, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type CategoryStreak = {
  categoryId: string;
  /** How many consecutive months the category came in under-budget. */
  months: number;
  /** Total cents UNDER budget across the streak (informational). */
  underBudgetTotal: Money;
};

export function computeStreaks(
  accounts: Account[],
  categories: Category[],
  txns: Transaction[],
  assignments: MonthAssignment[],
  thisMonth: string,
  maxLookback = 24,
): CategoryStreak[] {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  // Index: per-month per-category spent (positive cents).
  const monthCatSpent = new Map<string, Map<string, number>>(); // month -> catId -> spent
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    const m = t.date.slice(0, 7);
    let mm = monthCatSpent.get(m);
    if (!mm) { mm = new Map(); monthCatSpent.set(m, mm); }
    for (const part of categoriesTouched(t)) {
      if (!part.categoryId) continue;
      if (part.amount >= 0) continue;
      mm.set(part.categoryId, (mm.get(part.categoryId) ?? 0) + -part.amount);
    }
  }
  // Index: per-month per-category assigned.
  const monthCatAssigned = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    let mm = monthCatAssigned.get(a.month);
    if (!mm) { mm = new Map(); monthCatAssigned.set(a.month, mm); }
    mm.set(a.categoryId, a.assigned);
  }

  const out: CategoryStreak[] = [];
  for (const c of categories) {
    if (c.hidden) continue;
    let months = 0;
    let underTotal = 0;
    for (let i = 1; i <= maxLookback; i++) {
      const m = shiftMonth(thisMonth, -i);
      const assigned = monthCatAssigned.get(m)?.get(c.id) ?? 0;
      const spent = monthCatSpent.get(m)?.get(c.id) ?? 0;
      // Streak qualifier: had a non-zero budget, came in under it.
      if (assigned <= 0) break;
      if (spent > assigned) break;
      months++;
      underTotal += assigned - spent;
    }
    if (months > 0) out.push({ categoryId: c.id, months, underBudgetTotal: underTotal });
  }
  // Sort by streak length desc — longest first.
  out.sort((a, b) => b.months - a.months);
  return out;
}

function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
