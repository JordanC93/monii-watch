/**
 * Foreign-exchange helpers for multi-currency on-budget accounts.
 *
 * Resolution order for the rate to apply when converting an account-
 * currency amount to the budget currency:
 *
 *   1. If the account's currency matches the budget currency (or
 *      currency is unset), the rate is 1.
 *   2. Look up `Settings.fxSnapshots` for an entry matching the
 *      transaction's `month` × `from`/`to` pair. If found, use it.
 *   3. Fallback to the account's stored `fxRate`. (1 if unset.)
 *
 * Snapshot lock-in matters because re-entering an old transaction
 * shouldn't silently shift past months' assignments. For the next
 * iteration we'd ideally surface a UI to update + lock month rates.
 */

import type { Account, FxSnapshot, Money, Transaction } from './types';

/**
 * Convert an `amount` in the account's currency to the budget currency.
 * `month` is the ISO yyyy-mm of the transaction (used to look up the
 * snapshot). Returns the same `amount` when the account is in budget
 * currency or has no rate defined.
 */
export function convertToBudgetCurrency(
  amount: Money,
  account: Account | undefined,
  budgetCurrency: string,
  month: string,
  snapshots: FxSnapshot[] = [],
): Money {
  const rate = lookupRate(account, budgetCurrency, month, snapshots);
  if (rate === 1) return amount;
  return Math.round(amount * rate);
}

export function lookupRate(
  account: Account | undefined,
  budgetCurrency: string,
  month: string,
  snapshots: FxSnapshot[] = [],
): number {
  if (!account) return 1;
  if (!account.currency || account.currency === budgetCurrency) return 1;
  // Snapshot match: same month + same currency pair.
  for (const s of snapshots) {
    if (s.month === month && s.from === account.currency && s.to === budgetCurrency) {
      return s.rate;
    }
  }
  // Fallback to account's stored rate.
  if (typeof account.fxRate === 'number' && account.fxRate > 0) return account.fxRate;
  return 1;
}

/**
 * Convert a transaction's amount to budget currency. Convenience
 * wrapper that figures out the month from `t.date`.
 */
export function txnAmountInBudgetCurrency(
  t: Transaction,
  account: Account | undefined,
  budgetCurrency: string,
  snapshots: FxSnapshot[] = [],
): Money {
  return convertToBudgetCurrency(t.amount, account, budgetCurrency, t.date.slice(0, 7), snapshots);
}

/** Account uses non-budget currency? */
export function isForeignCurrency(account: Account | undefined, budgetCurrency: string): boolean {
  if (!account || !account.currency) return false;
  return account.currency !== budgetCurrency;
}

/**
 * Return a Map<accountId, rate> for a given month so callers don't have
 * to invoke `lookupRate` per transaction. Significantly cheaper for hot
 * paths like `computeMonthBudget` which iterate every transaction.
 */
export function buildRateLookup(
  accounts: Account[],
  budgetCurrency: string,
  month: string,
  snapshots: FxSnapshot[] = [],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of accounts) {
    out.set(a.id, lookupRate(a, budgetCurrency, month, snapshots));
  }
  return out;
}
