/**
 * Recurring auto-allocation engine (Tier 6 #1).
 *
 * Each rule binds a trigger (paycheck / income-over / monthly-1st) to a
 * target category + amount. When the trigger fires, the engine adds the
 * configured cents to the assignment for the current month. Only ADDS —
 * a manual adjustment after the fire is preserved.
 *
 * Pure compute over rules + context — the actual mutation lives in
 * `db/repo.ts → applyAllocationRulesForTrigger()`.
 */

import type { AllocationRule, Money, Transaction } from './types';

export type AllocationTrigger = 'paycheck' | 'income-over' | 'monthly-1st';

export type AllocationContext = {
  /** ISO yyyy-mm-dd of "today" (today's call). */
  today: string;
  /** ISO yyyy-mm of the budget month to allocate to. */
  month: string;
  /**
   * Optional triggering transaction — required for the `paycheck` and
   * `income-over` triggers (we use its amount + date), ignored for
   * monthly-1st.
   */
  triggerTxn?: Pick<Transaction, 'amount' | 'date'>;
};

export type AllocationMove = {
  ruleId: string;
  targetCategoryId: string;
  cents: Money;
};

/**
 * Decide which rules should fire for the given trigger + context.
 * Returns the moves to apply (caller writes them via repo).
 *
 * Dedup: rules with `lastFiredOn === ctx.today` are skipped UNLESS the
 * trigger is `paycheck` (multiple paychecks on the same day are valid
 * — e.g. two jobs, one on Friday).
 *
 * Sort: by priority asc, ties broken by createdAt asc so older rules
 * fire first.
 */
export function evaluateAllocationRules(
  rules: AllocationRule[],
  trigger: AllocationTrigger,
  ctx: AllocationContext,
): AllocationMove[] {
  const enabled = rules.filter((r) => r.enabled && r.trigger === trigger);
  enabled.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.createdAt - b.createdAt;
  });

  const out: AllocationMove[] = [];
  for (const r of enabled) {
    // Dedup is per-trigger:
    //   - paycheck:    no dedup (multiple paychecks/day are valid)
    //   - income-over: no dedup (each qualifying inflow fires)
    //   - monthly-1st: once per day (idempotent boot)
    if (trigger === 'monthly-1st' && r.lastFiredOn === ctx.today) continue;

    if (trigger === 'income-over') {
      const txnAmt = ctx.triggerTxn?.amount ?? 0;
      const threshold = r.threshold ?? 0;
      if (txnAmt < threshold) continue;
    }
    if (trigger === 'monthly-1st') {
      // Only fire on day 1.
      if (ctx.today.slice(8, 10) !== '01') continue;
    }
    if (trigger === 'paycheck') {
      // Only fire on POSITIVE inflows; the engine never moves money on
      // outflows even if the user mis-tagged a refund.
      const txnAmt = ctx.triggerTxn?.amount ?? 0;
      if (txnAmt <= 0) continue;
    }

    if (r.amount <= 0) continue;
    if (!r.targetCategoryId) continue;

    out.push({ ruleId: r.id, targetCategoryId: r.targetCategoryId, cents: r.amount });
  }
  return out;
}

/** Trigger labels used by the Settings UI. */
export const TRIGGER_LABELS: Record<AllocationTrigger, string> = {
  paycheck: 'Every paycheck',
  'income-over': 'When income exceeds threshold',
  'monthly-1st': 'On the 1st of each month',
};
