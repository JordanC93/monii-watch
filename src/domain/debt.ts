/**
 * Debt payoff planner. Takes the user's current debt accounts (negative
 * balances on credit/loan/mortgage) plus an APR per debt and a monthly
 * payment budget, and simulates two strategies side by side:
 *
 *   - Snowball: pay extra toward the smallest balance first (motivational).
 *   - Avalanche: pay extra toward the highest APR first (mathematically optimal).
 *
 * No persistence — the APR comes from the UI; we don't add an APR field to
 * the Account model. Pure simulation, not advice.
 */

import type { Money } from './types';

export type DebtItem = {
  /** Account identifier from the user's accounts list. */
  accountId: string;
  name: string;
  /** Outstanding balance in cents (always positive — pass abs(account.balance)). */
  balance: Money;
  /** Annual percentage rate as a decimal. e.g. 0.18 for 18% APR. */
  apr: number;
  /** Required minimum monthly payment in cents. */
  minPayment: Money;
};

export type PayoffStrategy = 'snowball' | 'avalanche';

export type PayoffResult = {
  strategy: PayoffStrategy;
  /** Months until everything is paid off. Capped at 600 (50 years). */
  months: number;
  /** Total interest paid across all debts. */
  totalInterest: Money;
  /** Order debts get paid off in. */
  payoffOrder: Array<{ accountId: string; name: string; monthsToPayoff: number; interestPaid: Money }>;
};

export type SimulateInput = {
  debts: DebtItem[];
  /** Total monthly payment budget across all debts in cents. Must cover minimums. */
  monthlyBudget: Money;
  strategy: PayoffStrategy;
};

const MAX_MONTHS = 600;

export function simulatePayoff(input: SimulateInput): PayoffResult {
  // Defensive copies — we mutate balances each month.
  const remaining = input.debts.map((d) => ({
    ...d,
    balance: d.balance,
    interestPaid: 0,
    monthsToPayoff: 0,
  }));
  const order: PayoffResult['payoffOrder'] = [];
  let monthsElapsed = 0;

  while (remaining.some((d) => d.balance > 0) && monthsElapsed < MAX_MONTHS) {
    monthsElapsed++;

    // Step 1: accrue interest on each remaining debt.
    for (const d of remaining) {
      if (d.balance <= 0) continue;
      const monthlyRate = d.apr / 12;
      const interest = Math.round(d.balance * monthlyRate);
      d.balance += interest;
      d.interestPaid += interest;
    }

    // Step 2: pay minimums. Retired debts' minimums join the extra pool
    // (the snowball/avalanche roll-forward), as does any leftover when a
    // final minimum overshoots the remaining balance.
    const activeMins = remaining.reduce((s, d) => (d.balance > 0 ? s + d.minPayment : s), 0);
    let extraPool = Math.max(0, input.monthlyBudget - activeMins);
    for (const d of remaining) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, d.minPayment);
      d.balance -= pay;
      extraPool += d.minPayment - pay;
    }

    // Step 3: distribute extra according to strategy. Pour into the
    // priority debt; if it gets paid off mid-month, roll the leftover into
    // the next priority debt (a key part of both snowball and avalanche).
    const queue = sortForStrategy(remaining.filter((d) => d.balance > 0), input.strategy);
    for (const d of queue) {
      if (extraPool <= 0) break;
      const pay = Math.min(d.balance, extraPool);
      d.balance -= pay;
      extraPool -= pay;
    }

    // Step 4: record newly retired debts in payoff order.
    for (const d of remaining) {
      if (d.balance <= 0 && d.monthsToPayoff === 0) {
        d.monthsToPayoff = monthsElapsed;
        order.push({
          accountId: d.accountId,
          name: d.name,
          monthsToPayoff: monthsElapsed,
          interestPaid: d.interestPaid,
        });
      }
    }
  }

  return {
    strategy: input.strategy,
    months: monthsElapsed,
    totalInterest: remaining.reduce((s, d) => s + d.interestPaid, 0),
    payoffOrder: order,
  };
}

function sortForStrategy(debts: DebtItem[], strategy: PayoffStrategy): DebtItem[] {
  const copy = [...debts];
  if (strategy === 'snowball') copy.sort((a, b) => a.balance - b.balance);
  else copy.sort((a, b) => b.apr - a.apr);
  return copy;
}
