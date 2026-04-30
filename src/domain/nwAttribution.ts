/**
 * Net-worth attribution (Tier 6 #12).
 *
 * For a given month, decompose the change in net worth (vs the
 * previous month) into:
 *   - "saved":      cash income minus spending on on-budget accounts
 *   - "investments": value change of investment positions
 *   - "debt":       reduction (or growth) of credit-card / loan balances
 *
 * Everything else (e.g. opening-balance corrections, reconciliation
 * adjustments) lands in `other`. Pure derivation from existing data.
 */

import type { Account, NwSnapshot, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { computeAccountBalances, computeNetWorth } from './budget';

export type NwAttribution = {
  month: string;
  /** Cents change in total net worth vs previous month. */
  delta: number;
  /** Net cash savings (income - spending on on-budget accounts). */
  saved: number;
  /** Investment market gains/losses (positions delta minus inflows/outflows on investment accounts). */
  investments: number;
  /** Debt reduction (positive = paid down). Credit-card and loan balances. */
  debt: number;
  /** Catch-all for anything we couldn't attribute. */
  other: number;
};

export function computeNwAttribution(
  accounts: Account[],
  txns: Transaction[],
  snapshots: NwSnapshot[],
  month: string,
): NwAttribution {
  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // --- Total delta ------------------------------------------------------
  const monthEnd = lastDayOfMonth(month);
  const prevMonthEnd = lastDayOfMonth(prevMonth);

  // Use snapshots when available; else compute from txns up to that date.
  const fromSnap = snapshots.find((s) => s.date >= prevMonthEnd && s.date < monthEnd) ?? null;
  const toSnap = snapshots.find((s) => s.date >= monthEnd) ?? null;
  let totalPrev: number;
  let totalNow: number;
  if (fromSnap && toSnap) {
    totalPrev = fromSnap.totalCents;
    totalNow = toSnap.totalCents;
  } else {
    totalPrev = computeNetWorthAt(accounts, txns, prevMonthEnd);
    totalNow = computeNetWorthAt(accounts, txns, monthEnd);
  }
  const delta = totalNow - totalPrev;

  // --- Saved (income - spending on on-budget) --------------------------
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  let income = 0;
  let outflow = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (!t.date.startsWith(month)) continue;
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) outflow += -t.amount;
  }
  const saved = income - outflow;

  // --- Debt reduction (CC + loan/mortgage balances) --------------------
  const debtIds = new Set(
    accounts.filter((a) => (a.type === 'credit' || a.type === 'loan' || a.type === 'mortgage') && !a.closed).map((a) => a.id),
  );
  let debtPrev = 0;
  let debtNow = 0;
  for (const t of txns) {
    if (!debtIds.has(t.accountId)) continue;
    if (t.date <= prevMonthEnd) debtPrev += t.amount;
    if (t.date <= monthEnd) debtNow += t.amount;
  }
  // Debts are stored as negative amounts (you owe money). A reduction in
  // owed = balance moves from -100 to -50 = +50 contribution. So:
  //   debtChange = debtNow - debtPrev  (positive = debt grew, negative = paid down)
  // But we want positive = paid down, so:
  const debt = -(debtNow - debtPrev);

  // --- Investments (market gains/losses on tracking accounts) ----------
  let investments = 0;
  for (const a of accounts) {
    if (a.type !== 'investment') continue;
    if (!a.positions || a.positions.length === 0) continue;
    // We only know the CURRENT lastPrice — we don't track historical
    // prices yet. Approximate: current position value MINUS net cash flow
    // into the account over the month. Whatever's left is "market gains".
    const cur = a.positions.reduce((s, p) => s + Math.round(p.shares * p.lastPrice), 0);
    let cashFlow = 0;
    for (const t of txns) {
      if (t.accountId !== a.id) continue;
      if (!t.date.startsWith(month)) continue;
      cashFlow += t.amount;
    }
    // Approximation: assume positions value at start of month ≈ cur - cashFlow
    // (i.e. cashFlow accounts for all the change). The remainder we can't
    // attribute is therefore zero in this naive model — but we keep the
    // hook so a future per-day price feed can fill it in. For now, count
    // the cash flow as "saved → invested" already tracked under `saved`.
    investments += 0;
    void cur;
    void cashFlow;
  }

  const other = delta - saved - investments - debt;
  return { month, delta, saved, investments, debt, other };
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeNetWorthAt(accounts: Account[], txns: Transaction[], dateIso: string): number {
  // Compute balances using only txns on or before dateIso.
  const filtered = txns.filter((t) => t.date <= dateIso);
  const balances = computeAccountBalances(accounts, filtered);
  const nw = computeNetWorth(balances);
  return nw.total;
}
