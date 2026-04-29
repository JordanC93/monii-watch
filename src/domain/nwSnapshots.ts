/**
 * Net-worth snapshot capture.
 *
 * Runs once per app boot. If today doesn't have a snapshot yet, computes
 * the current net worth and stores it under the ISO date. Old snapshots
 * (>5 years) are pruned to bound storage growth.
 *
 * Reads from the live transaction list each boot — no observers needed
 * (we don't want to capture mid-day balance flickers).
 */

import { computeAccountBalances, computeNetWorth } from './budget';
import { listAccounts, listTransactions, listNwSnapshots, setNwSnapshot, pruneOldNwSnapshots } from '../db/repo';
import { todayIso } from './date';

export function captureSnapshotIfNeeded(): { added: boolean; snapshot?: { date: string; total: number } } {
  const today = todayIso();
  const existing = listNwSnapshots();
  if (existing.some((s) => s.date === today)) return { added: false };

  const accounts = listAccounts();
  const txns = listTransactions();
  const balances = computeAccountBalances(accounts, txns);
  const nw = computeNetWorth(balances);

  setNwSnapshot({
    date: today,
    totalCents: nw.total,
    onBudgetCents: nw.onBudget,
    trackingCents: nw.tracking,
  });
  // Keep storage bounded.
  pruneOldNwSnapshots();
  return { added: true, snapshot: { date: today, total: nw.total } };
}
