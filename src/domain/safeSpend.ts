/**
 * Safe-to-spend / weekly-spend banner math (Tier 6 #3).
 *
 * Computes:
 *   - days-until-next-paycheck (uses pay schedule; null if not set)
 *   - cash on hand (sum of liquid on-budget balances)
 *   - safe daily spend rate
 *
 * Excludes scheduled bills due before the next paycheck — that money is
 * spoken for. The result is the spendable cents PER DAY assuming you
 * want to land at $0 right before payday.
 */

import type { Account, ScheduledTransaction, Settings, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { computeAccountBalances } from './budget';
import { nextPaycheck } from './paySchedule';
import { advanceDate } from './recurrence';

export type SafeSpend = {
  /** ISO yyyy-mm-dd of the next paycheck (or null when pay schedule isn't set). */
  nextPaycheckIso: string | null;
  daysUntilPaycheck: number | null;
  /** Sum of liquid (checking/savings/cash) on-budget balances in cents. */
  cashOnHand: number;
  /** Cents owed to upcoming scheduled outflows before next paycheck. */
  upcomingBills: number;
  /** cashOnHand - upcomingBills (capped at 0). */
  spendable: number;
  /** Per-day spendable cents — `spendable / max(1, daysUntilPaycheck)`. */
  perDay: number;
  /** True when we have enough info to display a non-trivial number. */
  ready: boolean;
};

export function computeSafeSpend(
  accounts: Account[],
  txns: Transaction[],
  scheduled: ScheduledTransaction[],
  settings: Pick<Settings, 'payFrequency' | 'payAnchorDate'>,
  todayIso: string,
): SafeSpend {
  const next = nextPaycheck(settings, todayIso);
  const daysUntil = next ? daysBetween(todayIso, next) : null;

  // Liquid balances only — not credit cards (you can't safely spend a CC limit).
  const balances = computeAccountBalances(accounts, txns);
  let cash = 0;
  for (const a of balances) {
    if (a.closed) continue;
    if (a.type === 'checking' || a.type === 'savings' || a.type === 'cash') {
      cash += a.balanceInBudgetCurrency;
    }
  }

  const horizonDays = daysUntil ?? 30;
  const horizonEnd = addDaysIso(todayIso, horizonDays);

  // Sum scheduled outflows whose nextDate falls between today (exclusive)
  // and horizonEnd (inclusive). Walks each schedule once, expanding
  // occurrences in the window.
  let upcoming = 0;
  for (const s of scheduled) {
    if (s.paused) continue;
    if (s.amount >= 0) continue; // only outflows
    let cursor = s.nextDate;
    let safety = 0;
    while (cursor && cursor <= horizonEnd && safety < 200) {
      if (cursor > todayIso) upcoming += -s.amount;
      if (s.endDate && cursor > s.endDate) break;
      cursor = advanceDate(cursor, s.frequency);
      safety++;
    }
  }

  void ACCOUNT_TYPE_META; // imported for type-narrowing reuse

  const spendable = Math.max(0, cash - upcoming);
  const perDay = Math.round(spendable / Math.max(1, horizonDays));
  return {
    nextPaycheckIso: next,
    daysUntilPaycheck: daysUntil,
    cashOnHand: cash,
    upcomingBills: upcoming,
    spendable,
    perDay,
    ready: cash > 0 || upcoming > 0,
  };
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00').getTime();
  const b = new Date(bIso + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
