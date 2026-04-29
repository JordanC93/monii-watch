/**
 * Single-slot LRU memoization for `computeMonthBudget`.
 *
 * The five callers (BudgetTable, GoalDealBanner, OverspendingAlert,
 * ReadyToAssign — when it computes underfunded goals, and GoalFundingModal)
 * each pass the same accounts/categories/txns/assignments/month into
 * `computeMonthBudget`. Without a cache, that's five identical walks
 * over the entire txn history per render.
 *
 * The cache stores up to MAX (default 8) recent snapshots, keyed by
 * the identity of the input arrays + month. Reference equality is the
 * cheapest correct check — any mutation produces a new array via Yjs +
 * Zustand, so this is sound and cheap.
 */

import {
  computeMonthBudget,
  type AccountWithBalance,
} from './budget';
import type { Account, Category, MonthAssignment, Transaction, Money } from './types';

type Key = [Account[], Category[], Transaction[], MonthAssignment[], string];
type Value = Map<string, { assigned: Money; activity: Money; available: Money }>;

const MAX = 8;
const cache: Array<{ key: Key; value: Value }> = [];

export function computeMonthBudgetCached(
  accounts: Account[],
  categories: Category[],
  txns: Transaction[],
  assignments: MonthAssignment[],
  month: string,
): Value {
  for (let i = 0; i < cache.length; i++) {
    const k = cache[i].key;
    if (
      k[0] === accounts &&
      k[1] === categories &&
      k[2] === txns &&
      k[3] === assignments &&
      k[4] === month
    ) {
      // Move to front (LRU)
      const hit = cache.splice(i, 1)[0];
      cache.unshift(hit);
      return hit.value;
    }
  }
  const value = computeMonthBudget(accounts, categories, txns, assignments, month);
  cache.unshift({ key: [accounts, categories, txns, assignments, month], value });
  if (cache.length > MAX) cache.length = MAX;
  return value;
}

// Re-export so callers can switch in without refactoring imports.
export type { AccountWithBalance };
