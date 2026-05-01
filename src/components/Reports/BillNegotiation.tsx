/**
 * Bill negotiation reminders report card (Tier 6 #19).
 *
 * Shows long-tenured recurring bills with a "call them and ask for a
 * discount" CTA. Once a reminder is dismissed, it stays quiet for a
 * year.
 */

import { useMemo } from 'react';
import { PhoneCall, Check } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { detectSubscriptions } from '../../domain/subscriptions';
import { findNegotiationCandidates } from '../../domain/billNegotiation';
import { recordBillNegotiationDismiss } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';

export function BillNegotiation() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  // Pull raw + default in render — safer than `?? []` in selector.
  const promptsRaw = useBudget((s) => s.settings.billNegotiationPrompts);
  const fmt = useFormatMoney();

  const candidates = useMemo(() => {
    const prompts = promptsRaw ?? [];
    const subs = detectSubscriptions(txns, payees, accounts);
    return findNegotiationCandidates(subs, prompts, todayIso());
  }, [txns, payees, accounts, promptsRaw]);

  if (candidates.length === 0) {
    return (
      <div className="text-[12px] text-fg-subtle text-center py-3">
        No long-tenured recurring bills yet. Subscriptions that have been paid for ≥12 months show up here once a year.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {candidates.slice(0, 5).map((c) => (
        <div key={c.subscription.payeeId} className="bg-surface-2/40 ring-1 ring-border rounded-md p-3 flex items-start gap-3">
          <PhoneCall size={16} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium">
              You've been with <strong>{c.subscription.payeeName}</strong> {c.months} months at {fmt(c.subscription.averageAmount)} {c.subscription.cadence}
            </div>
            <div className="text-[11.5px] text-fg-subtle">
              ≈ {fmt(c.annualCost)}/yr. Average customer who calls + asks gets $15-30/mo off. 10-minute call.
            </div>
            <div className="flex flex-wrap gap-2 mt-1.5 text-[11.5px]">
              <button
                onClick={() => recordBillNegotiationDismiss(c.subscription.payeeId, true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-positive/10 text-positive hover:bg-positive/20"
              >
                <Check size={11} /> Done · re-prompt next year
              </button>
              <button
                onClick={() => recordBillNegotiationDismiss(c.subscription.payeeId, false)}
                className="text-fg-subtle hover:text-fg"
              >
                Hide for now
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
