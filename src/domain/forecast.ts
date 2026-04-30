/**
 * Cash flow forecasting.
 *
 * Given current account balances + scheduled transactions + recent
 * spending averages, project the on-budget balance forward N days.
 * Output is a daily series suitable for a line chart.
 *
 * Methodology (deliberately transparent — no ML, no surprises):
 *
 *   1. Start from today's combined on-budget balance.
 *   2. For each day in the horizon:
 *      a. Apply any scheduled transactions due on that day.
 *      b. Apply the day's share of "trailing average daily spend"
 *         (variable spending that doesn't have a scheduled template).
 *      c. Apply a constant daily inflow contribution if the user has
 *         monthlyIncome set (treats it as evenly spread).
 *
 *   3. Confidence band ± 25% of the daily variable term, widening
 *      the further out we project. Pure heuristic — gives the chart
 *      a "this is a guess" visual cue instead of false precision.
 *
 * What this is NOT:
 *   - Not a prediction of specific day-of-month outcomes
 *   - Not a substitute for actually budgeting
 *   - Not aware of one-off events (vacation, big purchase) unless
 *     they're already a scheduled transaction
 *
 * What it IS:
 *   - Early warning for "checking will go negative on the 23rd
 *     unless something changes"
 *   - Quick gut-check: "do I have enough to cover the next 60 days
 *     of bills?"
 */

import type { Account, Money, ScheduledTransaction, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { advanceDate } from './recurrence';

export type ForecastPoint = {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Projected on-budget balance in cents at end-of-day. */
  projected: Money;
  /** Lower confidence bound (cents). */
  low: Money;
  /** Upper confidence bound (cents). */
  high: Money;
  /** True for days where a scheduled txn lands — annotation. */
  hasScheduled: boolean;
};

export type ForecastOptions = {
  /** Days to project forward. Default 60. */
  horizonDays?: number;
  /** Look-back window for trailing-average spend, in days. Default 60. */
  lookbackDays?: number;
  /** Confidence band as a fraction of daily variable spend. Default 0.25. */
  confidenceFraction?: number;
  /** Optional override of "today" for testing. */
  today?: string;
  /**
   * What-if: multiplier on variable spending. 1.0 = current pace,
   * 0.5 = "what if I spent half as much from now on", 1.25 = "what
   * if I spent 25% more". Used by the What-If page to overlay
   * scenarios on the baseline forecast.
   */
  variableSpendMultiplier?: number;
  /**
   * What-if: extra monthly income added on top of `monthlyIncome`.
   * Negative is allowed (income drop scenario).
   */
  extraMonthlyIncome?: number;
};

export function computeForecast(
  accounts: Account[],
  txns: Transaction[],
  scheduled: ScheduledTransaction[],
  monthlyIncome: Money,
  opts: ForecastOptions = {},
): ForecastPoint[] {
  const horizonDays = opts.horizonDays ?? 60;
  const lookbackDays = opts.lookbackDays ?? 60;
  const confidenceFraction = opts.confidenceFraction ?? 0.25;
  const todayStr = opts.today ?? new Date().toISOString().slice(0, 10);
  const today = parseISO(todayStr);

  // 1. Starting balance = sum of on-budget account balances right now.
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  let balance = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.date > todayStr) continue; // future-dated txns join the projection separately
    balance += t.amount;
  }

  // 2. Build a per-day map of scheduled transaction net for the horizon.
  //    Walks each scheduled template forward from its `nextDate` and
  //    drops projected occurrences into the day they land on.
  const scheduledByDay = new Map<string, Money>();
  for (const s of scheduled) {
    if (s.paused) continue;
    let cursor = s.nextDate;
    let safety = 0;
    while (cursor && cursor <= addDaysIso(todayStr, horizonDays + 1) && safety < 1000) {
      if (cursor >= todayStr) {
        scheduledByDay.set(cursor, (scheduledByDay.get(cursor) ?? 0) + s.amount);
      }
      if (s.endDate && cursor > s.endDate) break;
      cursor = advanceDate(cursor, s.frequency);
      safety++;
    }
  }

  // 3. Trailing-average daily VARIABLE spend (non-scheduled outflows).
  //    Sum every outflow in the lookback window that isn't already
  //    represented in `scheduled` (rough heuristic: ignore txns whose
  //    payee matches a scheduled-template payee).
  const scheduledPayeeIds = new Set(scheduled.map((s) => s.payeeId).filter(Boolean));
  const lookbackStart = addDaysIso(todayStr, -lookbackDays);
  let variableSpend = 0;
  let inflows = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.date < lookbackStart || t.date > todayStr) continue;
    // Tier 6 #9 — exclude one-time outliers from variable-spend baseline.
    if (t.oneTime) continue;
    if (t.amount >= 0) {
      inflows += t.amount;
    } else {
      // Skip if this looks like a scheduled-payee charge — already covered.
      if (t.payeeId && scheduledPayeeIds.has(t.payeeId)) continue;
      variableSpend += -t.amount;
    }
  }
  const variableMultiplier = opts.variableSpendMultiplier ?? 1;
  const extraIncome = opts.extraMonthlyIncome ?? 0;
  const dailyVariable = (variableSpend / Math.max(1, lookbackDays)) * variableMultiplier;
  // Daily variable inflow — we only use monthlyIncome if it's set, since
  // historical inflow can be lumpy and dominated by one-time deposits.
  const dailyIncome = monthlyIncome > 0 ? (monthlyIncome + extraIncome) / 30 : Math.max(0, inflows / Math.max(1, lookbackDays)) + extraIncome / 30;

  // 4. Walk forward.
  const out: ForecastPoint[] = [];
  for (let d = 0; d <= horizonDays; d++) {
    const dateStr = addDaysIso(todayStr, d);
    const sched = scheduledByDay.get(dateStr) ?? 0;
    if (d > 0) {
      balance += sched;
      balance += Math.round(dailyIncome - dailyVariable);
    }
    const widen = 1 + d / Math.max(1, horizonDays); // band widens 1× → 2× over the horizon
    const band = Math.round(dailyVariable * confidenceFraction * widen * (d + 1));
    out.push({
      date: dateStr,
      projected: balance,
      low: balance - band,
      high: balance + band,
      hasScheduled: sched !== 0,
    });
  }

  void today;
  return out;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDaysIso(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
