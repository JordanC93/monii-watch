/**
 * Budget calculations. Pure functions over domain state. The store calls these
 * to derive computed numbers; nothing here mutates anything.
 *
 * The envelope model:
 *  - Inflows on on-budget accounts increase "Ready to Assign"
 *  - User assigns money to categories per month (MonthAssignment.assigned)
 *  - Spending in a category in a month decreases that month's Available
 *  - Positive Available rolls to next month; negative rolls to next month too
 *    (overspent categories show red until covered).
 */

import type { Account, Category, FxSnapshot, MonthAssignment, Transaction, Money } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';
import { isoIsInMonth, parseMonth } from './date';
import { parseISO } from 'date-fns';
import { lookupRate } from './fx';

export type AccountWithBalance = Account & {
  balance: Money;
  clearedBalance: Money;
  uncleared: Money;
  /**
   * Balance converted into the budget currency. Equals `balance` for accounts
   * in the budget currency or with no fxRate set. Only differs when the
   * account has its own `currency` and `fxRate` (tracking accounts only).
   */
  balanceInBudgetCurrency: Money;
};

/** Compute current and cleared balances for every account.
 *
 *  For investment accounts that have positions defined, the live
 *  market value (sum of shares × lastPrice across positions) is added
 *  to the cash-flow-derived balance. So a "balance" on an investment
 *  account = cash sitting in the account + value of holdings. Cost
 *  basis is informational; the gain/loss math lives in InvestmentsPage. */
export function computeAccountBalances(accounts: Account[], txns: Transaction[]): AccountWithBalance[] {
  const byAcct = new Map<string, { balance: Money; clearedBalance: Money }>();
  for (const a of accounts) byAcct.set(a.id, { balance: 0, clearedBalance: 0 });
  for (const t of txns) {
    const e = byAcct.get(t.accountId);
    if (!e) continue;
    e.balance += t.amount;
    if (t.cleared !== 'uncleared') e.clearedBalance += t.amount;
  }
  return accounts.map((a) => {
    const e = byAcct.get(a.id) ?? { balance: 0, clearedBalance: 0 };
    const rate = a.fxRate && a.fxRate > 0 ? a.fxRate : 1;
    let balance = e.balance;
    let clearedBalance = e.clearedBalance;
    // Add live market value of investment positions (if any).
    if (a.type === 'investment' && a.positions && a.positions.length > 0) {
      let posValue = 0;
      for (const p of a.positions) posValue += Math.round(p.shares * p.lastPrice);
      balance += posValue;
      clearedBalance += posValue;
    }
    return {
      ...a,
      balance,
      clearedBalance,
      uncleared: balance - clearedBalance,
      balanceInBudgetCurrency: Math.round(balance * rate),
    };
  });
}

/** Total assets (positive on-budget) and tracking accounts at this moment.
 *  Tracking accounts in foreign currencies are converted via their fxRate. */
export function computeNetWorth(accounts: AccountWithBalance[]): { onBudget: Money; tracking: Money; total: Money } {
  let onBudget = 0;
  let tracking = 0;
  for (const a of accounts) {
    if (a.closed) continue;
    if (ACCOUNT_TYPE_META[a.type].onBudget) onBudget += a.balanceInBudgetCurrency;
    else tracking += a.balanceInBudgetCurrency;
  }
  return { onBudget, tracking, total: onBudget + tracking };
}

/**
 * Compute per-category activity for a single month.
 * Activity is the *signed* sum of transactions touching that category in that month
 * on on-budget accounts. (Outflows are negative, refunds positive.)
 *
 * Multi-currency: when an on-budget account uses a non-budget currency,
 * the txn's amount is converted to budget currency using the account's
 * `fxRate` or a per-month snapshot from `budgetCurrency`/`fxSnapshots`.
 */
export function computeMonthActivity(
  accounts: Account[],
  categories: Category[],
  txns: Transaction[],
  month: string,
  budgetCurrency: string = 'USD',
  fxSnapshots: FxSnapshot[] = [],
): Map<string, Money> {
  const onBudgetAcctIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const result = new Map<string, Money>();
  for (const c of categories) result.set(c.id, 0);

  for (const t of txns) {
    if (!onBudgetAcctIds.has(t.accountId)) continue;
    if (!isoIsInMonth(t.date, month)) continue;
    if (t.transferAccountId) continue; // transfers don't affect category activity
    const acct = acctById.get(t.accountId);
    const rate = lookupRate(acct, budgetCurrency, month, fxSnapshots);
    for (const part of categoriesTouched(t)) {
      if (!part.categoryId) continue;
      const prev = result.get(part.categoryId) ?? 0;
      const converted = rate === 1 ? part.amount : Math.round(part.amount * rate);
      result.set(part.categoryId, prev + converted);
    }
  }
  return result;
}

/**
 * Compute per-category Available for a single month, accounting for prior-month rollover.
 *
 * available[m] = sum_{i <= m} (assigned[i] + activity[i])
 *   where activity is signed (negative for outflow, positive for refund).
 *
 * Returns map: categoryId -> { assigned, activity, available }.
 */
export function computeMonthBudget(
  accounts: Account[],
  categories: Category[],
  txns: Transaction[],
  assignments: MonthAssignment[],
  month: string,
  budgetCurrency: string = 'USD',
  fxSnapshots: FxSnapshot[] = [],
): Map<string, { assigned: Money; activity: Money; available: Money }> {
  // Walk months from min(any data) to `month` accumulating per category.
  const allMonths = collectMonthsUpTo(month, txns, assignments);
  const running = new Map<string, Money>();
  for (const c of categories) running.set(c.id, 0);

  let lastMonth: string | null = null;
  let lastActivity = new Map<string, Money>();

  for (const m of allMonths) {
    const activity = computeMonthActivity(accounts, categories, txns, m, budgetCurrency, fxSnapshots);
    const monthAssignments = assignments.filter((a) => a.month === m);
    const assignedById = new Map<string, Money>();
    for (const a of monthAssignments) assignedById.set(a.categoryId, a.assigned);

    for (const c of categories) {
      const a = assignedById.get(c.id) ?? 0;
      const act = activity.get(c.id) ?? 0;
      running.set(c.id, (running.get(c.id) ?? 0) + a + act);
    }
    lastMonth = m;
    lastActivity = activity;
  }

  // Build final result for the requested month.
  const result = new Map<string, { assigned: Money; activity: Money; available: Money }>();
  const monthAssignments = assignments.filter((a) => a.month === month);
  const assignedById = new Map<string, Money>();
  for (const a of monthAssignments) assignedById.set(a.categoryId, a.assigned);

  for (const c of categories) {
    const assigned = assignedById.get(c.id) ?? 0;
    const activity = lastMonth === month ? (lastActivity.get(c.id) ?? 0) : (computeMonthActivity(accounts, categories, txns, month, budgetCurrency, fxSnapshots).get(c.id) ?? 0);
    const available = running.get(c.id) ?? 0;
    result.set(c.id, { assigned, activity, available });
  }
  return result;
}

function collectMonthsUpTo(month: string, txns: Transaction[], assignments: MonthAssignment[]): string[] {
  let earliest: string | null = null;
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    if (!earliest || m < earliest) earliest = m;
  }
  for (const a of assignments) {
    if (!earliest || a.month < earliest) earliest = a.month;
  }
  if (!earliest || earliest > month) return [month];
  const months: string[] = [];
  let cur = earliest;
  while (cur <= month) {
    months.push(cur);
    cur = shiftMonthString(cur, 1);
  }
  return months;
}

function shiftMonthString(m: string, delta: number): string {
  const d = parseMonth(m);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/**
 * "Ready to Assign" for the given month:
 *   = total inflows (on-budget) up to and including this month
 *     - total amounts assigned (across all months <= this month)
 *
 * In YNAB this is the single most important number on the page.
 */
/**
 * "Age of Money" — average number of days between when money arrived
 * (an inflow) and when it was spent (an outflow). YNAB's signature metric;
 * higher = more financial buffer.
 *
 * Uses a FIFO queue: walk transactions chronologically, push inflows onto a
 * queue, and consume them with each outflow. The number of days each consumed
 * dollar waited is averaged over the last `windowDays` of outflow.
 */
export function computeAgeOfMoney(
  accounts: Account[],
  txns: Transaction[],
  asOf: Date = new Date(),
  windowDays = 30,
): number | null {
  const onBudgetIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
  // Sorted ascending
  const sorted = [...txns]
    .filter((t) => onBudgetIds.has(t.accountId) && !t.transferAccountId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  type Slice = { date: string; remaining: number };
  const queue: Slice[] = [];
  const ageDaysAccumulated: number[] = [];
  const ageDollars: number[] = [];

  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  for (const t of sorted) {
    if (t.amount > 0) {
      queue.push({ date: t.date, remaining: t.amount });
    } else if (t.amount < 0) {
      let need = -t.amount;
      while (need > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(head.remaining, need);
        // Track if this outflow is within our window of interest
        if (t.date >= cutoffISO) {
          const d1 = parseISO(head.date);
          const d2 = parseISO(t.date);
          const days = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
          ageDaysAccumulated.push(days * take);
          ageDollars.push(take);
        }
        head.remaining -= take;
        need -= take;
        if (head.remaining <= 0) queue.shift();
      }
    }
  }

  const dollars = ageDollars.reduce((s, x) => s + x, 0);
  if (dollars === 0) return null;
  const totalDayDollars = ageDaysAccumulated.reduce((s, x) => s + x, 0);
  return Math.round(totalDayDollars / dollars);
}

/**
 * Quick stats for the budget header — this month's income, spending, net.
 * Simpler than computeMonthBudget, scoped to inflows / outflows on on-budget
 * accounts within the month string `month` (YYYY-MM).
 */
export function computeMonthStats(
  accounts: Account[],
  txns: Transaction[],
  month: string,
  budgetCurrency: string = 'USD',
  fxSnapshots: FxSnapshot[] = [],
): { income: Money; spent: Money; net: Money } {
  const onBudgetIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  let income = 0;
  let spent = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (!t.date.startsWith(month)) continue;
    const rate = lookupRate(acctById.get(t.accountId), budgetCurrency, month, fxSnapshots);
    const amt = rate === 1 ? t.amount : Math.round(t.amount * rate);
    if (amt > 0) income += amt;
    else if (amt < 0) spent += -amt;
  }
  return { income, spent, net: income - spent };
}

export function computeReadyToAssign(
  accounts: Account[],
  txns: Transaction[],
  assignments: MonthAssignment[],
  month: string,
  budgetCurrency: string = 'USD',
  fxSnapshots: FxSnapshot[] = [],
): Money {
  const onBudgetAcctIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  let inflows = 0;
  for (const t of txns) {
    if (!onBudgetAcctIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.date.slice(0, 7) > month) continue;
    const txnMonth = t.date.slice(0, 7);
    const rate = lookupRate(acctById.get(t.accountId), budgetCurrency, txnMonth, fxSnapshots);
    if (t.splits.length > 0) {
      for (const s of t.splits) {
        if (s.categoryId === null) {
          inflows += rate === 1 ? s.amount : Math.round(s.amount * rate);
        }
      }
    } else if (t.categoryId === null) {
      inflows += rate === 1 ? t.amount : Math.round(t.amount * rate);
    }
  }
  let assigned = 0;
  for (const a of assignments) {
    if (a.month <= month) assigned += a.assigned;
  }
  return inflows - assigned;
}
