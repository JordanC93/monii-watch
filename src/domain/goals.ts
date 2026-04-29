/**
 * Goal progress computations. Pure functions over a category's goal,
 * the current month's assignment, and the available carry-over.
 */

import type { Category, CategoryGoal, Money } from './types';
import { monthsBetween, parseMonth } from './date';
import { format } from 'date-fns';

export type GoalProgress = {
  type: CategoryGoal['type'];
  /** How much you need to assign this month to be on-track. */
  needed: Money;
  /** Already covered (what's "assigned" + what's already "available" beyond what you need). */
  covered: Money;
  /** Display label like "$200 needed by April" or "$50 / month" */
  label: string;
  /** 0..1 — useful for progress bars. May exceed 1 when over-funded. */
  ratio: number;
  /** Status for color coding. */
  status: 'underfunded' | 'funded' | 'overfunded' | 'noGoal';
};

const NO_GOAL: GoalProgress = {
  type: 'monthlyFunding', needed: 0, covered: 0, label: '', ratio: 0, status: 'noGoal',
};

/**
 * Compute how much of this category's goal is met for the given month, given
 * the current month's `assigned` and the rolling `available` carry-over.
 */
export function computeGoalProgress(
  category: Category,
  month: string,
  assigned: Money,
  available: Money,
): GoalProgress {
  const goal = category.goal;
  if (!goal || goal.amount <= 0) return NO_GOAL;

  switch (goal.type) {
    case 'monthlyFunding': {
      const needed = goal.amount;
      const covered = assigned;
      const ratio = needed === 0 ? 0 : covered / needed;
      return {
        type: 'monthlyFunding',
        needed, covered,
        label: `${formatCents(goal.amount)} / month`,
        ratio,
        status: covered >= needed ? (covered > needed ? 'overfunded' : 'funded') : 'underfunded',
      };
    }
    case 'targetBalance': {
      const needed = Math.max(goal.amount - (available - assigned), 0);
      // covered relative to total target
      const covered = Math.min(available, goal.amount);
      const ratio = goal.amount === 0 ? 0 : covered / goal.amount;
      return {
        type: 'targetBalance',
        needed, covered,
        label: `${formatCents(goal.amount)} target`,
        ratio,
        status: available >= goal.amount ? (available > goal.amount ? 'overfunded' : 'funded') : 'underfunded',
      };
    }
    case 'targetByDate': {
      const due = goal.dueDate;
      if (!due) return NO_GOAL;
      const dueMonth = due.slice(0, 7);
      const remainingMonths = Math.max(monthsBetween(month, dueMonth) + 1, 1);
      const remainingDollars = Math.max(goal.amount - (available - assigned), 0);
      const needed = Math.ceil(remainingDollars / remainingMonths);
      const covered = assigned;
      const ratio = needed === 0 ? 1 : covered / needed;
      const dueLabel = format(parseMonth(dueMonth), 'MMM yyyy');
      return {
        type: 'targetByDate',
        needed, covered,
        label: `${formatCents(goal.amount)} by ${dueLabel}`,
        ratio,
        status: available >= goal.amount ? 'funded' : (covered >= needed ? 'funded' : 'underfunded'),
      };
    }
  }
}

function formatCents(cents: Money): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  if (abs % 100 === 0) return `${sign}$${(abs / 100).toLocaleString()}`;
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
