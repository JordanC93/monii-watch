/**
 * Selectors that merge live store data with sandbox overlays.
 *
 * Components that want to be sandbox-aware (cash-flow forecast,
 * safe-to-spend banner, overdraft banner, what-if) call these
 * helpers instead of reading `useBudget` directly. When sandbox
 * is inactive they pass through.
 */

import { useBudget } from './budget';
import { useSandbox, sandboxScheduledToReal } from './sandbox';
import type { Money, ScheduledTransaction } from '../domain/types';

/** Live `monthlyIncome`, with sandbox override applied if active. */
export function useEffectiveMonthlyIncome(): Money {
  const live = useBudget((s) => s.settings.monthlyIncome);
  const active = useSandbox((s) => s.active);
  const override = useSandbox((s) => s.monthlyIncomeOverride);
  if (!active || override === null) return live;
  return override;
}

/** Live scheduled[] with sandbox hypotheticals appended. */
export function useEffectiveScheduled(): ScheduledTransaction[] {
  const live = useBudget((s) => s.scheduled);
  const active = useSandbox((s) => s.active);
  const sandbox = useSandbox((s) => s.scheduled);
  if (!active || sandbox.length === 0) return live;
  return [...live, ...sandbox.map(sandboxScheduledToReal)];
}
