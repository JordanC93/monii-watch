/**
 * Per-account historical balance series. Pure compute over a single
 * account's transactions — produces month-end (or week-end) balances
 * suitable for a line chart.
 */

import type { Account, Money, Transaction } from './types';

export type BalancePoint = {
  /** ISO yyyy-mm-dd of the bucket boundary. */
  date: string;
  /** Balance at end of that bucket (cumulative, in account currency). */
  balance: Money;
};

/**
 * Compute one balance point per month for the trailing `months` months
 * (oldest first). Each point is the running balance through the LAST
 * day of that month.
 */
export function computeMonthlyBalanceHistory(
  account: Account,
  txns: Transaction[],
  months: number = 12,
  todayIso: string = new Date().toISOString().slice(0, 10),
): BalancePoint[] {
  const today = new Date(todayIso + 'T00:00:00');
  // Build the list of month-end dates, oldest first.
  const monthEnds: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0); // last day of month i months back
    monthEnds.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  // Sort transactions for this account ascending.
  const sorted = txns
    .filter((t) => t.accountId === account.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let cursor = 0;
  let running = 0;
  const out: BalancePoint[] = [];
  for (const eod of monthEnds) {
    while (cursor < sorted.length && sorted[cursor].date <= eod) {
      running += sorted[cursor].amount;
      cursor++;
    }
    out.push({ date: eod, balance: running });
  }
  // Add any positions value at the END date for investment accounts
  // (positions don't move historically — just adds a flat layer to
  // every point so the chart doesn't show a misleading dip).
  if (account.type === 'investment' && account.positions && account.positions.length > 0) {
    const posValue = account.positions.reduce((s, p) => s + Math.round(p.shares * p.lastPrice), 0);
    return out.map((p) => ({ ...p, balance: p.balance + posValue }));
  }
  return out;
}
