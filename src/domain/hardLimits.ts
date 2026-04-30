/**
 * Hard spending limits (Tier 9 #7). Per-category caps with
 * velocity-based mid-month warnings.
 *
 * Distinct from envelope assignments: an envelope tells you what
 * you've put aside; a hard limit tells you what you've decided is
 * the absolute max for the month, no rollover, no exceptions.
 *
 * Velocity check: if you've spent X% of the limit by day Y of the
 * month, where X / Y > 1 (you're burning faster than days are
 * passing), surface a warning.
 */

import type { Money, Settings, Transaction } from './types';
import type { Account } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type LimitStatus = {
  categoryId: string;
  limitCents: Money;
  spentCents: Money;
  /** 0..1+. >1 means over the limit. */
  pct: number;
  /** Day of the month (1..31). */
  day: number;
  /** Days in the month (28..31). */
  daysInMonth: number;
  /** Velocity ratio: pct / (day / daysInMonth). >1 = ahead of pace. */
  velocity: number;
  state: 'ok' | 'velocity-warn' | 'near-limit' | 'over';
  mode: 'warn' | 'block';
  /** True when velocityAlert is on AND we're past 75% of pace ahead. */
  showVelocityAlert: boolean;
};

export function computeLimitStatuses(
  accounts: Account[],
  txns: Transaction[],
  limits: Settings['hardSpendingLimits'],
  monthIso: string,
  todayIso: string,
): LimitStatus[] {
  if (!limits) return [];
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );

  // Compute spent per category for the month.
  const spentByCat = new Map<string, number>();
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (!t.date.startsWith(monthIso)) continue;
    for (const part of categoriesTouched(t)) {
      if (!part.categoryId) continue;
      if (part.amount >= 0) continue;
      spentByCat.set(part.categoryId, (spentByCat.get(part.categoryId) ?? 0) + (-part.amount));
    }
  }

  // Day-of-month for velocity.
  const today = new Date(todayIso + 'T00:00:00');
  const day = today.getDate();
  const isCurrentMonth = todayIso.slice(0, 7) === monthIso;
  const [y, m] = monthIso.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const effectiveDay = isCurrentMonth ? day : daysInMonth;

  const out: LimitStatus[] = [];
  for (const [categoryId, cfg] of Object.entries(limits)) {
    const spent = spentByCat.get(categoryId) ?? 0;
    const pct = cfg.limitCents > 0 ? spent / cfg.limitCents : 0;
    const dayPace = effectiveDay / daysInMonth;
    const velocity = dayPace > 0 ? pct / dayPace : 0;
    let state: LimitStatus['state'] = 'ok';
    if (pct >= 1.0) state = 'over';
    else if (pct >= 0.9) state = 'near-limit';
    else if (cfg.velocityAlert && velocity >= 1.5) state = 'velocity-warn';
    out.push({
      categoryId,
      limitCents: cfg.limitCents,
      spentCents: spent,
      pct,
      day: effectiveDay,
      daysInMonth,
      velocity,
      state,
      mode: cfg.mode,
      showVelocityAlert: cfg.velocityAlert === true && velocity >= 1.5 && pct < 1.0,
    });
  }
  return out;
}
