/**
 * Credit-card-specific computations. Pure functions over an Account + its
 * transactions, returning everything the Credit Cards page (and chat
 * intents) need to surface.
 *
 *   - `balance` — current outstanding balance in cents (positive when you
 *     owe money on the card)
 *   - `utilization` — balance / creditLimit, 0..1+. Null when no limit set.
 *   - `daysUntilDue` — based on the configured `paymentDueDay` rolling
 *     forward to the next occurrence after `today`. Null when not set.
 *   - `daysUntilStatement` — same idea for `statementClosingDay`
 *   - `availableCredit` — limit - balance, capped at 0 when over-limit
 *   - `interestProjection` — naive monthly interest if balance is carried,
 *     using the stored APR. Null when APR not set.
 */

import type { Account, Money, Transaction } from './types';
import { parseISO } from 'date-fns';

export type CreditCardSummary = {
  account: Account;
  balance: Money;
  /** Same as `balance` but always positive — saves callers a Math.abs. */
  balanceOwed: Money;
  creditLimit: Money | null;
  availableCredit: Money | null;
  /** balance / limit, 0..1+. >1 means over the limit. Null when no limit. */
  utilization: number | null;
  daysUntilDue: number | null;
  daysUntilStatement: number | null;
  /** Monthly interest in cents if balance is carried, given current APR. Null when APR unset or balance ≤ 0. */
  interestProjection: Money | null;
  /** Convenience: did the user enter all the metadata to enable full features? */
  fullyConfigured: boolean;
};

export function computeCreditCardSummary(
  account: Account,
  txns: Transaction[],
  today: string,
): CreditCardSummary {
  // Sum all transactions for this account. Credit balances are stored as
  // negative numbers (debt), so a card with -$235.24 balance means $235.24 owed.
  let balance = 0;
  for (const t of txns) if (t.accountId === account.id) balance += t.amount;
  const balanceOwed = balance < 0 ? -balance : 0;

  const limit = account.creditLimit ?? null;
  const utilization = limit && limit > 0 ? balanceOwed / limit : null;
  const availableCredit = limit !== null ? Math.max(0, limit - balanceOwed) : null;

  const daysUntilDue = account.paymentDueDay
    ? daysUntilNextOccurrence(today, account.paymentDueDay)
    : null;
  const daysUntilStatement = account.statementClosingDay
    ? daysUntilNextOccurrence(today, account.statementClosingDay)
    : null;

  // Interest projection: balance × APR / 12. Treats APR as the *purchase* rate;
  // doesn't model grace periods or different rates for cash advances.
  const interestProjection = account.apr && account.apr > 0 && balanceOwed > 0
    ? Math.round(balanceOwed * (account.apr / 12))
    : null;

  const fullyConfigured = !!(account.apr && account.creditLimit
    && account.statementClosingDay && account.paymentDueDay);

  return {
    account, balance, balanceOwed, creditLimit: limit, availableCredit,
    utilization, daysUntilDue, daysUntilStatement, interestProjection,
    fullyConfigured,
  };
}

/** Health label for utilization, mirroring common credit-score guidance. */
export function utilizationStatus(util: number | null): {
  label: string; tone: 'positive' | 'accent' | 'warning' | 'negative' | 'neutral';
} {
  if (util === null) return { label: 'No limit set', tone: 'neutral' };
  if (util === 0)    return { label: 'Paid off', tone: 'positive' };
  if (util <= 0.10)  return { label: 'Excellent', tone: 'positive' };
  if (util <= 0.30)  return { label: 'Good', tone: 'accent' };
  if (util <= 0.50)  return { label: 'Watch', tone: 'warning' };
  if (util <= 1.00)  return { label: 'High', tone: 'negative' };
  return { label: 'Over limit', tone: 'negative' };
}

/**
 * Days from `today` to the next occurrence of `dayOfMonth`. If today's day
 * IS the target day, returns 0. If today's day is past it, jumps to the
 * next month. Doesn't worry about months that are shorter than the target
 * day (Feb 30) — those are clamped to the last day of the month.
 */
function daysUntilNextOccurrence(todayIso: string, dayOfMonth: number): number {
  const today = parseISO(todayIso);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Try this month first.
  const target = clampedDayDate(t.getFullYear(), t.getMonth(), dayOfMonth);
  if (target.getTime() >= t.getTime()) {
    return Math.round((target.getTime() - t.getTime()) / 86400000);
  }
  // Roll to next month.
  const next = clampedDayDate(t.getFullYear(), t.getMonth() + 1, dayOfMonth);
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}

function clampedDayDate(year: number, monthZeroBased: number, day: number): Date {
  // JS Date handles overflow (Date(2026, 1, 30) → Mar 2). Use the last day
  // of the target month if `day` exceeds it.
  const lastDay = new Date(year, monthZeroBased + 1, 0).getDate();
  return new Date(year, monthZeroBased, Math.min(day, lastDay));
}

export function totalCreditUtilization(summaries: CreditCardSummary[]): {
  totalBalance: Money;
  totalLimit: Money;
  utilization: number | null;
} {
  let bal = 0;
  let lim = 0;
  for (const s of summaries) {
    bal += s.balanceOwed;
    if (s.creditLimit) lim += s.creditLimit;
  }
  return {
    totalBalance: bal,
    totalLimit: lim,
    utilization: lim > 0 ? bal / lim : null,
  };
}
