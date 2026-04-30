/**
 * Burn-rate / runway calculator (Tier 8 #9).
 *
 * "If income stops today, how many months of cash runway do I have?"
 *
 * Method:
 *   - Cash on hand = liquid balances (checking, savings, cash) only
 *     (not credit limits — those add to debt, not runway)
 *   - Burn rate = trailing-N-month average outflow on on-budget
 *     accounts, excluding `oneTime` flagged transactions
 *   - Runway months = cash / burn (capped at 240 months / 20 years)
 */

import type { Account, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { computeAccountBalances } from './budget';

export type Runway = {
  cashOnHand: Money;
  monthlyBurnAvg: Money;
  /** Capped at 240 months (20 years). Returns null when burn is 0. */
  monthsRunway: number | null;
  /** Months counted in the burn-rate average. */
  lookbackMonths: number;
  /** Net rate (income - outflow) per month — for the "if you keep
   *  earning at this rate" estimate. */
  monthlyNetAvg: Money;
};

export function computeRunway(
  accounts: Account[],
  txns: Transaction[],
  lookbackMonths: number = 6,
  todayIso: string = new Date().toISOString().slice(0, 10),
): Runway {
  const today = new Date(todayIso + 'T00:00:00');
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );

  // Liquid cash only.
  const balances = computeAccountBalances(accounts, txns);
  let cash = 0;
  for (const a of balances) {
    if (a.closed) continue;
    if (a.type === 'checking' || a.type === 'savings' || a.type === 'cash') {
      cash += a.balanceInBudgetCurrency;
    }
  }

  // Burn rate over the trailing N months.
  const cutoff = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - lookbackMonths, 1);
    return d.toISOString().slice(0, 10);
  })();
  let outflow = 0;
  let inflow = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue;
    if (t.date < cutoff || t.date > todayIso) continue;
    if (t.amount < 0) outflow += -t.amount;
    else if (t.amount > 0) inflow += t.amount;
  }
  const monthlyBurn = Math.round(outflow / lookbackMonths);
  const monthlyNet = Math.round((inflow - outflow) / lookbackMonths);
  const months = monthlyBurn > 0 ? Math.min(240, cash / monthlyBurn) : null;

  return {
    cashOnHand: cash,
    monthlyBurnAvg: monthlyBurn,
    monthsRunway: months,
    lookbackMonths,
    monthlyNetAvg: monthlyNet,
  };
}

/**
 * Per-month savings rate trend over the trailing window.
 * Each entry: month, saved (income - outflow), savings rate
 * (saved / income). Months with zero income render as null
 * savings rate so the chart skips them gracefully.
 */
export type SavingsRatePoint = {
  month: string;
  income: Money;
  outflow: Money;
  net: Money;
  /** 0..1+. Negative when outflow > income. */
  rate: number | null;
};

export function computeSavingsRateTrend(
  accounts: Account[],
  txns: Transaction[],
  months: number = 12,
  todayIso: string = new Date().toISOString().slice(0, 10),
): SavingsRatePoint[] {
  const today = new Date(todayIso + 'T00:00:00');
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const monthsList: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const out: SavingsRatePoint[] = monthsList.map((month) => ({
    month, income: 0, outflow: 0, net: 0, rate: null,
  }));
  const idx = new Map(monthsList.map((m, i) => [m, i]));
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue;
    const i = idx.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    if (t.amount > 0) out[i].income += t.amount;
    else if (t.amount < 0) out[i].outflow += -t.amount;
  }
  for (const p of out) {
    p.net = p.income - p.outflow;
    p.rate = p.income > 0 ? p.net / p.income : null;
  }
  return out;
}
