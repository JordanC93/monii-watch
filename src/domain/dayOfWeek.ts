/**
 * Day-of-week spending analysis. Pure compute over transactions.
 *
 * Use case: "Where does my discretionary money go?" — usually
 * Friday/Saturday weekend bursts. Surfacing this as a heatmap
 * encourages awareness without judgment.
 */

import type { Account, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';

export type DayOfWeekStat = {
  dayIndex: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  label: string;
  totalCents: Money;
  txnCount: number;
  /** Average per occurrence (totalCents / txnCount). Zero when no txns. */
  avgPerTxn: Money;
};

const LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function computeDayOfWeekSpend(
  accounts: Account[],
  txns: Transaction[],
  windowDays: number = 90,
  todayIso: string = new Date().toISOString().slice(0, 10),
): DayOfWeekStat[] {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const cutoff = isoMinus(todayIso, windowDays);
  const totals = new Array<Money>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue;
    if (t.amount >= 0) continue; // outflows only
    if (t.date < cutoff || t.date > todayIso) continue;
    const idx = parseDayOfWeek(t.date);
    totals[idx] += -t.amount;
    counts[idx] += 1;
  }
  return LABELS.map((label, i) => ({
    dayIndex: i,
    label,
    totalCents: totals[i],
    txnCount: counts[i],
    avgPerTxn: counts[i] > 0 ? Math.round(totals[i] / counts[i]) : 0,
  }));
}

/** 0..6 (Sun..Sat) for an ISO yyyy-mm-dd. */
export function parseDayOfWeek(iso: string): number {
  // Construct as local date — same convention used elsewhere in the app.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function isoMinus(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
