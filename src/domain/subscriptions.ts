/**
 * Heuristic subscription detector.
 *
 * Walks transaction history grouped by payee, looks for runs of similar-amount
 * outflows landing on a regular cadence, and returns the patterns it finds. No
 * persistence — purely derived from existing data, recomputed on demand.
 *
 * Recognized cadences (period in days, ± `cadenceTolerance` days per gap):
 *   - weekly:   7
 *   - biweekly: 14
 *   - monthly:  30 (with wider tolerance to absorb 28/30/31-day months)
 *   - yearly:   365
 *
 * Amounts are considered "similar" when each one is within `amountTolerance`
 * (default 12%) of the run's mean, OR within $1 — whichever is larger. The
 * dollar fudge factor catches subscriptions whose price ticks up by a buck.
 */

import type { Transaction, Payee, Account, RecurrenceFrequency, Money } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { parseISO } from 'date-fns';

export type DetectedSubscription = {
  payeeId: string;
  payeeName: string;
  /** The most-frequently-used account for this run. */
  accountId: string;
  accountName: string;
  /** The most-frequently-used category, or null if the run is uncategorized. */
  categoryId: string | null;
  /** Average outflow in cents (positive). */
  averageAmount: Money;
  cadence: RecurrenceFrequency;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** Predicted next charge date based on average gap. ISO yyyy-mm-dd. */
  predictedNext: string;
  /** Sample transaction IDs in chronological order, newest last. */
  transactionIds: string[];
};

type Candidate = {
  cadence: RecurrenceFrequency;
  expectedDays: number;
  tolerance: number;
};

const CADENCES: Candidate[] = [
  { cadence: 'weekly',   expectedDays: 7,   tolerance: 2 },
  { cadence: 'biweekly', expectedDays: 14,  tolerance: 3 },
  { cadence: 'monthly',  expectedDays: 30,  tolerance: 6 },
  { cadence: 'yearly',   expectedDays: 365, tolerance: 14 },
];

export type DetectOptions = {
  /** Minimum recurrences required to count as a subscription. Default 2. */
  minOccurrences?: number;
  /** Default 0.12 (12%). */
  amountTolerance?: number;
};

export function detectSubscriptions(
  txns: Transaction[],
  payees: Payee[],
  accounts: Account[],
  opts: DetectOptions = {},
): DetectedSubscription[] {
  const minOccurrences = opts.minOccurrences ?? 2;
  const amountTolerance = opts.amountTolerance ?? 0.12;

  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const payeeName = (id: string | null) => id ? (payees.find((p) => p.id === id)?.name ?? 'Unknown') : 'Unknown';
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Unknown';

  // Group outflow txns by payee → ascending date
  const byPayee = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.payeeId) continue;
    if (t.transferAccountId) continue;
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.amount >= 0) continue; // only outflows count as subscriptions
    if (t.splits.length > 0) continue; // splits aren't single-purpose payments
    const list = byPayee.get(t.payeeId) ?? [];
    list.push(t);
    byPayee.set(t.payeeId, list);
  }

  const results: DetectedSubscription[] = [];

  for (const [payeeId, txList] of byPayee) {
    if (txList.length < minOccurrences) continue;
    const sorted = [...txList].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Try each cadence and pick the longest run that fits.
    let bestRun: Transaction[] = [];
    let bestCadence: Candidate | null = null;
    for (const cad of CADENCES) {
      const run = longestRunWithCadence(sorted, cad, amountTolerance);
      if (run.length > bestRun.length) {
        bestRun = run;
        bestCadence = cad;
      }
    }
    if (!bestCadence || bestRun.length < minOccurrences) continue;

    const meanCents = Math.round(
      bestRun.reduce((s, t) => s + Math.abs(t.amount), 0) / bestRun.length,
    );

    // Pick the most-common account + category in the run.
    const accountId = pickMostCommon(bestRun.map((t) => t.accountId));
    const categoryId = pickMostCommonNullable(bestRun.map((t) => t.categoryId));

    const last = bestRun[bestRun.length - 1];
    const predictedNext = addDaysIso(last.date, bestCadence.expectedDays);

    results.push({
      payeeId,
      payeeName: payeeName(payeeId),
      accountId,
      accountName: accountName(accountId),
      categoryId,
      averageAmount: meanCents,
      cadence: bestCadence.cadence,
      occurrences: bestRun.length,
      firstDate: bestRun[0].date,
      lastDate: last.date,
      predictedNext,
      transactionIds: bestRun.map((t) => t.id),
    });
  }

  // Sort by total annual cost (most expensive first).
  return results.sort((a, b) => annualCost(b) - annualCost(a));
}

/** Annualized cost of a subscription, used for ranking. */
export function annualCost(s: DetectedSubscription): Money {
  const perYear = {
    daily: 365, weekly: 52, biweekly: 26, monthly: 12, yearly: 1,
  } as const;
  return s.averageAmount * perYear[s.cadence];
}

function longestRunWithCadence(
  sortedAsc: Transaction[],
  cad: Candidate,
  amountTolerance: number,
): Transaction[] {
  if (sortedAsc.length < 2) return [];
  let best: Transaction[] = [];
  // Start a run from each transaction; greedily extend forward while gaps + amounts fit.
  for (let i = 0; i < sortedAsc.length; i++) {
    const run: Transaction[] = [sortedAsc[i]];
    let runMean = Math.abs(sortedAsc[i].amount);
    for (let j = i + 1; j < sortedAsc.length; j++) {
      const prev = run[run.length - 1];
      const gap = daysBetween(prev.date, sortedAsc[j].date);
      if (gap < cad.expectedDays - cad.tolerance) continue; // ignore extra in-between charges
      if (gap > cad.expectedDays + cad.tolerance) break;     // gap too large; run is over
      const amt = Math.abs(sortedAsc[j].amount);
      const allow = Math.max(runMean * amountTolerance, 100); // ≥ $1 fudge
      if (Math.abs(amt - runMean) > allow) continue;
      run.push(sortedAsc[j]);
      runMean = (runMean * (run.length - 1) + amt) / run.length;
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = parseISO(aIso).getTime();
  const b = parseISO(bIso).getTime();
  return Math.round(Math.abs(b - a) / 86400000);
}

function addDaysIso(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pickMostCommon<T>(xs: T[]): T {
  // Caller-side: every site that calls this passes a non-empty array
  // (guarded by `bestRun.length >= minOccurrences` upstream). The throw
  // below is defensive — if this ever fires we want a loud failure
  // rather than a silent `undefined as T`.
  if (xs.length === 0) throw new Error('pickMostCommon: array is empty');
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = xs[0]; let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function pickMostCommonNullable<T>(xs: (T | null)[]): T | null {
  const counts = new Map<T | null, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | null = null; let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

/**
 * Compare a subscription's average amount this quarter vs last quarter.
 * Returns the percentage change (0.13 = +13%) or null when there isn't
 * enough data on both sides to compare.
 *
 * Per the user's spec: alert at ≥10% increase.
 */
export type SubscriptionCreep = {
  subscription: DetectedSubscription;
  prevAvg: Money;
  currentAvg: Money;
  /** decimal — 0.13 = +13% increase */
  pctChange: number;
};

const CREEP_THRESHOLD = 0.10;

export function detectSubscriptionCreep(
  subs: DetectedSubscription[],
  txns: Transaction[],
): SubscriptionCreep[] {
  // Define windows: "current quarter" = last 90 days, "prev quarter" = 90-180 days ago.
  const today = new Date();
  const cutoffCurrent = isoMinus(today, 0);
  const cutoffPrevEnd = isoMinus(today, 90);
  const cutoffPrevStart = isoMinus(today, 180);

  const byPayee = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.payeeId || t.transferAccountId || t.amount >= 0) continue;
    const list = byPayee.get(t.payeeId) ?? [];
    list.push(t);
    byPayee.set(t.payeeId, list);
  }

  const out: SubscriptionCreep[] = [];
  for (const sub of subs) {
    const list = byPayee.get(sub.payeeId);
    if (!list) continue;
    const current = list.filter((t) => t.date <= cutoffCurrent && t.date > cutoffPrevEnd);
    const prev = list.filter((t) => t.date <= cutoffPrevEnd && t.date > cutoffPrevStart);
    if (current.length < 1 || prev.length < 1) continue;
    const cAvg = Math.round(current.reduce((s, t) => s + Math.abs(t.amount), 0) / current.length);
    const pAvg = Math.round(prev.reduce((s, t) => s + Math.abs(t.amount), 0) / prev.length);
    if (pAvg === 0) continue;
    const pct = (cAvg - pAvg) / pAvg;
    if (pct >= CREEP_THRESHOLD) {
      out.push({ subscription: sub, prevAvg: pAvg, currentAvg: cAvg, pctChange: pct });
    }
  }
  return out.sort((a, b) => b.pctChange - a.pctChange);
}

function isoMinus(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Lightweight "is this txn part of a recurring pattern" check, used by
 * the post-create smart-detect toast. Looks at the same payee's history
 * for ≥3 prior outflows of similar amount on a regular cadence. Returns
 * the detected cadence or null.
 *
 * Cheaper than `detectSubscriptions` because it walks only one payee's
 * txns and stops at the first cadence match.
 */
export function detectRecurringForPayee(
  payeeId: string,
  amount: Money,
  txns: Transaction[],
  scheduled: Array<{ payeeId: string | null }>,
): RecurrenceFrequency | null {
  // Skip if there's already a scheduled template for this payee.
  if (scheduled.some((s) => s.payeeId === payeeId)) return null;

  const target = Math.abs(amount);
  if (target <= 0) return null;

  // Pull the same-payee outflows, sorted ascending.
  const prior = txns
    .filter((t) => t.payeeId === payeeId && !t.transferAccountId && t.amount < 0 && t.splits.length === 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (prior.length < 3) return null;

  // Filter to similar-amount rows (within 12% or $1, like detectSubscriptions).
  const similar = prior.filter((t) => {
    const diff = Math.abs(Math.abs(t.amount) - target);
    const allow = Math.max(target * 0.12, 100);
    return diff <= allow;
  });
  if (similar.length < 3) return null;

  // Check if the gaps cluster around one of the known cadences.
  const gaps: number[] = [];
  for (let i = 1; i < similar.length; i++) {
    const a = new Date(similar[i - 1].date + 'T00:00:00').getTime();
    const b = new Date(similar[i].date + 'T00:00:00').getTime();
    gaps.push(Math.round((b - a) / 86400000));
  }
  // Score each cadence by how many gaps fall within tolerance.
  for (const cad of CADENCES) {
    const fits = gaps.filter((g) => g >= cad.expectedDays - cad.tolerance && g <= cad.expectedDays + cad.tolerance).length;
    if (fits >= Math.max(2, gaps.length - 1)) return cad.cadence;
  }
  return null;
}
