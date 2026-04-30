/**
 * Anomaly / unusual-transaction detection.
 *
 * For each on-budget outflow, compare its amount against the
 * payee's history. Flag as anomalous when:
 *   - There's enough history (≥4 prior outflows for the payee)
 *   - The amount is meaningfully larger than usual (z-score > 2 vs
 *     payee mean OR ≥ 2× median)
 *   - The amount is non-trivial (> $20) — small noise stays quiet
 *
 * Pure compute — no schema, no caching needed (cheap O(n) scan
 * with per-payee aggregation).
 */

import type { Transaction, Money } from './types';
import { todayIso } from './date';

export type AnomalyReason = 'amount-spike' | 'first-time-high';

export type Anomaly = {
  txnId: string;
  payeeId: string;
  amount: Money;
  /** Z-score vs payee history (only meaningful when reason='amount-spike'). */
  zScore: number;
  /** Median of prior outflows for this payee. */
  payeeMedian: Money;
  /** How many priors we considered. */
  priors: number;
  reason: AnomalyReason;
};

const MIN_AMOUNT_CENTS = 2000; // $20
const MIN_PRIORS = 4;
const Z_THRESHOLD = 2.0;
const MEDIAN_MULTIPLIER = 2.0;
const LOOKBACK_DAYS = 180;

export type DetectAnomalyOpts = {
  /** Only consider txns dated within this window of today. Default 14 days. */
  recentDays?: number;
  /** Optional override of "today" for testing. */
  today?: string;
};

export function detectAnomalies(
  txns: Transaction[],
  opts: DetectAnomalyOpts = {},
): Anomaly[] {
  const recentDays = opts.recentDays ?? 14;
  const today = opts.today ?? todayIso();
  const lookbackStart = isoMinus(today, LOOKBACK_DAYS);
  const recentStart = isoMinus(today, recentDays);

  // Group prior outflows by payee, build stats.
  type PayeeStats = { amounts: number[]; mean: number; median: number; stdev: number };
  const byPayee = new Map<string, PayeeStats>();
  // First pass: collect ALL prior amounts (within lookback window, before today).
  for (const t of txns) {
    if (!t.payeeId) continue;
    if (t.transferAccountId) continue;
    if (t.amount >= 0) continue;
    if (t.oneTime) continue;
    if (t.date < lookbackStart || t.date > today) continue;
    const list = byPayee.get(t.payeeId);
    const v = -t.amount;
    if (list) list.amounts.push(v);
    else byPayee.set(t.payeeId, { amounts: [v], mean: 0, median: 0, stdev: 0 });
  }

  // Compute per-payee mean, median, stdev.
  for (const stats of byPayee.values()) {
    if (stats.amounts.length < 2) continue;
    const sum = stats.amounts.reduce((s, x) => s + x, 0);
    stats.mean = sum / stats.amounts.length;
    const sorted = [...stats.amounts].sort((a, b) => a - b);
    stats.median = sorted[Math.floor(sorted.length / 2)];
    const variance = stats.amounts.reduce(
      (s, x) => s + (x - stats.mean) ** 2, 0,
    ) / stats.amounts.length;
    stats.stdev = Math.sqrt(variance);
  }

  const out: Anomaly[] = [];
  // Second pass: flag recent txns whose amount is unusually high.
  for (const t of txns) {
    if (!t.payeeId) continue;
    if (t.transferAccountId) continue;
    if (t.amount >= 0) continue;
    if (t.oneTime) continue;
    if (t.date < recentStart || t.date > today) continue;
    const v = -t.amount;
    if (v < MIN_AMOUNT_CENTS) continue;
    const stats = byPayee.get(t.payeeId);
    if (!stats) continue;
    // Exclude this txn from its own statistics so a single big charge
    // doesn't normalize itself away.
    const priorAmounts = stats.amounts.filter((_, i) => i !== stats.amounts.indexOf(v));
    if (priorAmounts.length < MIN_PRIORS) continue;

    const priorSum = priorAmounts.reduce((s, x) => s + x, 0);
    const priorMean = priorSum / priorAmounts.length;
    const priorVariance = priorAmounts.reduce((s, x) => s + (x - priorMean) ** 2, 0) / priorAmounts.length;
    const priorStdev = Math.sqrt(priorVariance);
    const sorted = [...priorAmounts].sort((a, b) => a - b);
    const priorMedian = sorted[Math.floor(sorted.length / 2)];

    const z = priorStdev > 0 ? (v - priorMean) / priorStdev : 0;
    const ratio = priorMedian > 0 ? v / priorMedian : 0;

    if (z >= Z_THRESHOLD || ratio >= MEDIAN_MULTIPLIER) {
      out.push({
        txnId: t.id,
        payeeId: t.payeeId,
        amount: -t.amount,
        zScore: z,
        payeeMedian: priorMedian,
        priors: priorAmounts.length,
        reason: 'amount-spike',
      });
    }
  }

  // Sort: biggest dollar surprise first.
  return out.sort((a, b) => (b.amount - b.payeeMedian) - (a.amount - a.payeeMedian));
}

function isoMinus(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
