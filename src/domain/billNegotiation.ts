/**
 * Bill negotiation reminder candidates (Tier 6 #19).
 *
 * For each detected subscription that's been continuously paid for
 * ≥12 months AND hasn't been prompted in the last 365 days, surface
 * a reminder.
 */

import type { BillNegotiationPrompt } from './types';
import type { DetectedSubscription } from './subscriptions';

const MIN_MONTHS = 12;
const COOLDOWN_DAYS = 365;

export type BillNegotiationCandidate = {
  subscription: DetectedSubscription;
  /** Months of history. */
  months: number;
  /** Estimated annual cost. */
  annualCost: number;
};

export function findNegotiationCandidates(
  subs: DetectedSubscription[],
  prompts: BillNegotiationPrompt[],
  todayIso: string,
): BillNegotiationCandidate[] {
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const out: BillNegotiationCandidate[] = [];
  for (const sub of subs) {
    // Need ≥MIN_MONTHS history.
    const months = monthsBetween(sub.firstDate, sub.lastDate);
    if (months < MIN_MONTHS) continue;
    // Skip if prompted within the cooldown window.
    const prior = prompts.find((p) => p.payeeId === sub.payeeId);
    if (prior && now - prior.lastPromptedAt < cooldownMs) continue;
    void todayIso;
    const perYear = perYearMultiplier(sub.cadence);
    out.push({
      subscription: sub,
      months,
      annualCost: sub.averageAmount * perYear,
    });
  }
  return out.sort((a, b) => b.annualCost - a.annualCost);
}

function monthsBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00');
  const b = new Date(bIso + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function perYearMultiplier(cadence: DetectedSubscription['cadence']): number {
  switch (cadence) {
    case 'daily': return 365;
    case 'weekly': return 52;
    case 'biweekly': return 26;
    case 'monthly': return 12;
    case 'yearly': return 1;
  }
}
