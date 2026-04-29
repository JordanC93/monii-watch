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
import type { Category, MonthAssignment, Money } from './types';
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
};

export function computeGoalProjection(
  category: Category,
  available: Money,
  assignments: MonthAssignment[],
  now: string = thisMonthIso(),
): GoalProjection | null {
  const goal = category.goal;
  if (!goal) return null;
  if (goal.type !== 'targetBalance' && goal.type !== 'targetByDate') return null;

  const target = goal.amount;
  const current = Math.max(0, available);
  const remaining = Math.max(0, target - current);
  const ratio = target > 0 ? available / target : 0;

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

  // For targetByDate: if user has a deadline but no contribution history,
  // fall back to "what you'd need to contribute monthly to hit the deadline."
  if (goal.type === 'targetByDate' && monthlyRate === 0 && goal.dueDate) {
    const monthsToDeadline = monthsBetween(now, goal.dueDate.slice(0, 7));
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

  let pace: GoalProjection['pace'] = null;
  if (goal.type === 'targetByDate' && goal.dueDate && projectedDate) {
    const target = parseISO(goal.dueDate).getTime();
    const projected = parseISO(projectedDate).getTime();
    const diffDays = (projected - target) / 86400000;
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
  };
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
