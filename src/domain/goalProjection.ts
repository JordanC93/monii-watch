/**
 * Forward-looking goal projection for purchase goals (CategoryGoal of type
 * `targetBalance` or `targetByDate`).
 *
 * The math is honest: instead of returning *what you'd need to set aside*
 * (which `goals.ts` already does), this returns *when you'll actually reach
 * the goal* given your current pace. "Pace" is the trailing-3-month average
 * of monthly assignments to the category — empirical, not aspirational.
 *
 * If the user hasn't built any history yet (no prior assignments), we fall
 * back to the *currently assigned* amount as the projection rate so the
 * page isn't blank on a brand-new goal.
 */

import { addMonths, format, parseISO } from 'date-fns';
import type { Category, MonthAssignment, Money, RecurrenceFrequency, ScheduledTransaction } from './types';
import { DATE_FMT, shiftMonth, thisMonthIso } from './date';

export type GoalProjection = {
  /** The goal as set by the user. */
  targetAmount: Money;
  /** Currently saved (Available cents). */
  currentAmount: Money;
  /** Remaining to hit the goal — could be 0 or negative when funded. */
  remainingAmount: Money;
  /** 0..1+. Capped at 1 in the bar UI but raw value preserved. */
  ratio: number;
  /** Average monthly contribution rate in cents (trailing 3 months, falling back to the current month). */
  monthlyRate: Money;
  /**
   * Estimated completion date (ISO yyyy-mm-dd) at the current rate.
   * Null when monthlyRate is 0 (we can't project never-saving).
   */
  projectedDate: string | null;
  /**
   * For targetByDate goals: how the projected date compares to the user's
   * deadline. 'on-track' when projected ≤ target ± 1 month, 'ahead' when
   * earlier, 'behind' when later. Null for goals without a deadline.
   */
  pace: 'on-track' | 'ahead' | 'behind' | null;
  /** Months between now and projected completion (rounded up). 0 when funded. */
  monthsToFinish: number | null;
  /**
   * Sum of monthly contributions from any non-paused ScheduledTransaction
   * with `autoAssignCategoryId === category.id`. 0 when no scheduled
   * transfers are wired to this goal. This is the "what you've committed
   * to" rate, distinct from `monthlyRate` (the "what you've actually
   * been doing" trailing-3-month rate).
   */
  scheduledMonthlyRate: Money;
  /**
   * Estimated completion date assuming `scheduledMonthlyRate` keeps up.
   * Null when scheduledMonthlyRate is 0 OR the goal is already funded.
   * Surfaced separately from `projectedDate` so users can see "on paper
   * I'll hit it by X" alongside "at my actual pace I'll hit it by Y".
   */
  scheduledProjectedDate: string | null;
  /** Months from now until `scheduledProjectedDate`. Same null rules. */
  scheduledMonthsToFinish: number | null;
};

/**
 * Average occurrences per month for each recurrence frequency. Conservative
 * approximations using a 30.4375-day average month (Gregorian-correct).
 * Used to convert a per-occurrence amount into a monthly rate for ETA math.
 */
const OCCURRENCES_PER_MONTH: Record<RecurrenceFrequency, number> = {
  daily:    30.4375,
  weekly:   4.348,
  biweekly: 2.174,
  monthly:  1,
  yearly:   1 / 12,
};

/**
 * Sum of monthly contributions from every non-paused scheduled transaction
 * tied to `categoryId` via `autoAssignCategoryId`. Returns integer cents.
 *
 * Why `autoAssignCategoryId` and NOT `categoryId`: an envelope is funded
 * via `MonthAssignment`, never directly from an income/transfer txn. The
 * `autoAssignCategoryId` field is the explicit hook for "every time this
 * scheduled txn fires, also bump the assignment for that category."
 * That's the only signal that reliably means "this scheduled entry funds
 * this goal."
 */
export function monthlyRateFromScheduled(
  scheduledTxns: ScheduledTransaction[],
  categoryId: string,
): Money {
  let total = 0;
  for (const s of scheduledTxns) {
    if (s.paused) continue;
    if (s.autoAssignCategoryId !== categoryId) continue;
    const perMonth = Math.abs(s.amount) * OCCURRENCES_PER_MONTH[s.frequency];
    total += perMonth;
  }
  return Math.round(total);
}

export function computeGoalProjection(
  category: Category,
  available: Money,
  assignments: MonthAssignment[],
  scheduledTxns: ScheduledTransaction[] = [],
  now: string = thisMonthIso(),
): GoalProjection | null {
  const goal = category.goal;
  if (!goal) return null;
  if (goal.type !== 'targetBalance' && goal.type !== 'targetByDate' && goal.type !== 'annual') return null;

  const target = goal.amount;
  const current = Math.max(0, available);
  const remaining = Math.max(0, target - current);
  const ratio = target > 0 ? available / target : 0;
  // Tier 6 #16 — annual goals project against the next occurrence of the
  // recurring date. Treat them like a targetByDate where the deadline is
  // the next yearly hit of (annualMonth, annualDay).
  let dueDate: string | undefined = goal.dueDate;
  if (goal.type === 'annual' && goal.annualMonth && goal.annualDay) {
    dueDate = nextAnnualDate(goal.annualMonth, goal.annualDay, now);
  }

  // Average monthly contribution from assignments to this category over the
  // last 3 months (including the current month). If no history, use this
  // month's assignment as the rate.
  const months: string[] = [now, shiftMonth(now, -1), shiftMonth(now, -2)];
  const sumLastThree = months.reduce((acc, m) => {
    const a = assignments.find((x) => x.month === m && x.categoryId === category.id);
    return acc + (a?.assigned ?? 0);
  }, 0);
  const distinctMonthsWithData = months.filter((m) =>
    assignments.some((x) => x.month === m && x.categoryId === category.id && x.assigned > 0)
  ).length;
  let monthlyRate = distinctMonthsWithData > 0
    ? Math.round(sumLastThree / Math.max(distinctMonthsWithData, 1))
    : (assignments.find((x) => x.month === now && x.categoryId === category.id)?.assigned ?? 0);

  // Scheduled transfers wired to this goal (Tier 10 #11
  // `autoAssignCategoryId`). Always computed even when 0 so callers can
  // surface a "no scheduled transfers wired" hint when relevant.
  const scheduledMonthlyRate = monthlyRateFromScheduled(scheduledTxns, category.id);

  // If the user has scheduled funding wired up but hasn't built any
  // history yet (brand-new goal), use the scheduled rate as the pace
  // estimate. This matches user intent: "I just set up auto-deposit,
  // tell me when I'll get there based on that."
  if (monthlyRate === 0 && scheduledMonthlyRate > 0) {
    monthlyRate = scheduledMonthlyRate;
  }

  // For targetByDate / annual: if user has a deadline but still no
  // contribution signal at all, fall back to "what you'd need to
  // contribute monthly to hit the deadline."
  if ((goal.type === 'targetByDate' || goal.type === 'annual') && monthlyRate === 0 && dueDate) {
    const monthsToDeadline = monthsBetween(now, dueDate.slice(0, 7));
    if (monthsToDeadline > 0) monthlyRate = Math.ceil(remaining / monthsToDeadline);
  }

  let projectedDate: string | null = null;
  let monthsToFinish: number | null = null;
  if (remaining === 0) {
    projectedDate = format(parseISO(now + '-01'), DATE_FMT);
    monthsToFinish = 0;
  } else if (monthlyRate > 0) {
    monthsToFinish = Math.ceil(remaining / monthlyRate);
    const projected = addMonths(parseISO(now + '-01'), monthsToFinish);
    projectedDate = format(projected, DATE_FMT);
  }

  // Independent ETA based purely on scheduled commitments. Surfaced
  // alongside `projectedDate` when both exist so the user sees both
  // "actual pace" and "auto-deposit pace."
  let scheduledProjectedDate: string | null = null;
  let scheduledMonthsToFinish: number | null = null;
  if (remaining > 0 && scheduledMonthlyRate > 0) {
    scheduledMonthsToFinish = Math.ceil(remaining / scheduledMonthlyRate);
    const projected = addMonths(parseISO(now + '-01'), scheduledMonthsToFinish);
    scheduledProjectedDate = format(projected, DATE_FMT);
  }

  let pace: GoalProjection['pace'] = null;
  if ((goal.type === 'targetByDate' || goal.type === 'annual') && dueDate && projectedDate) {
    const targetMs = parseISO(dueDate).getTime();
    const projected = parseISO(projectedDate).getTime();
    const diffDays = (projected - targetMs) / 86400000;
    if (diffDays < -30) pace = 'ahead';
    else if (diffDays > 30) pace = 'behind';
    else pace = 'on-track';
  }

  return {
    targetAmount: target,
    currentAmount: current,
    remainingAmount: remaining,
    ratio,
    monthlyRate,
    projectedDate,
    pace,
    monthsToFinish,
    scheduledMonthlyRate,
    scheduledProjectedDate,
    scheduledMonthsToFinish,
  };
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Compute the next annual date — same month/day, this year if it hasn't
 * passed yet, else next year. Tier 6 #16.
 */
function nextAnnualDate(month: number, day: number, nowMonth: string): string {
  const [y, m] = nowMonth.split('-').map(Number);
  // First, try this year:
  const lastDayThisYear = new Date(y, month, 0).getDate();
  const safeDayThis = Math.min(day, lastDayThisYear);
  const candidateThis = `${y}-${String(month).padStart(2, '0')}-${String(safeDayThis).padStart(2, '0')}`;
  // If the candidate is past the current month, roll to next year.
  if (candidateThis.slice(0, 7) >= nowMonth) {
    return candidateThis;
  }
  if (m === month) {
    // Same month — if day is in the future, this year. Else next year.
    return candidateThis;
  }
  const nextY = y + 1;
  const lastDayNext = new Date(nextY, month, 0).getDate();
  const safeDayNext = Math.min(day, lastDayNext);
  return `${nextY}-${String(month).padStart(2, '0')}-${String(safeDayNext).padStart(2, '0')}`;
}
