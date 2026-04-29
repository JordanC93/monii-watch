/**
 * Per-payee spending aggregation. Used by the Spending by Payee report.
 */

import type { Account, Money, Payee, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';

export type PayeeSpendRow = {
  payeeId: string;
  payeeName: string;
  totalSpent: Money;
  totalEarned: Money;
  txnCount: number;
  /** Mean per-transaction outflow. */
  avgOutflow: Money;
  /** ISO yyyy-mm-dd of the most recent transaction with this payee. */
  lastTxnDate: string;
};

export function computePayeeSpend(
  accounts: Account[],
  txns: Transaction[],
  payees: Payee[],
  windowMonths: number,
  thisMonth: string,
): PayeeSpendRow[] {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const cutoff = shiftMonth(thisMonth, -(windowMonths - 1));
  const agg = new Map<string, { totalSpent: number; totalEarned: number; txnCount: number; lastTxnDate: string }>();
  for (const t of txns) {
    if (!t.payeeId) continue;
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    const m = t.date.slice(0, 7);
    if (m < cutoff || m > thisMonth) continue;
    const cur = agg.get(t.payeeId) ?? { totalSpent: 0, totalEarned: 0, txnCount: 0, lastTxnDate: '' };
    if (t.amount < 0) cur.totalSpent += -t.amount;
    else cur.totalEarned += t.amount;
    cur.txnCount += 1;
    if (t.date > cur.lastTxnDate) cur.lastTxnDate = t.date;
    agg.set(t.payeeId, cur);
  }
  const out: PayeeSpendRow[] = [];
  for (const [payeeId, data] of agg) {
    const p = payees.find((x) => x.id === payeeId);
    out.push({
      payeeId,
      payeeName: p?.name ?? '?',
      ...data,
      avgOutflow: data.txnCount > 0 ? Math.round(data.totalSpent / data.txnCount) : 0,
    });
  }
  out.sort((a, b) => b.totalSpent - a.totalSpent);
  return out;
}

function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
