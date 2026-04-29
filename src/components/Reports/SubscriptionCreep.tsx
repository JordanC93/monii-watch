/**
 * Subscription price-creep report card.
 *
 * Compares each detected subscription's average amount this quarter vs.
 * last quarter; lists every subscription that's gone up by 10% or more.
 * Hides itself when there are no offenders (so the card stays out of the
 * way for users whose vendors are well-behaved).
 */

import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { detectSubscriptions, detectSubscriptionCreep } from '../../domain/subscriptions';
import { useFormatMoney } from '../../lib/format';
import { TrendingUp } from 'lucide-react';

export function SubscriptionCreep() {
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const accounts = useBudget((s) => s.accounts);
  const fmt = useFormatMoney();

  const creeps = useMemo(() => {
    const subs = detectSubscriptions(txns, payees, accounts);
    return detectSubscriptionCreep(subs, txns);
  }, [txns, payees, accounts]);

  if (creeps.length === 0) {
    return (
      <div className="text-[12.5px] text-fg-subtle">
        No price increases detected. Subscriptions are holding steady — nice.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {creeps.map((c) => (
        <div
          key={c.subscription.payeeId}
          className="flex items-center gap-3 px-3 py-2 border border-warning/30 bg-warning/5 rounded-lg"
        >
          <div className="w-7 h-7 rounded-full grid place-items-center bg-warning/15 text-warning flex-shrink-0">
            <TrendingUp size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{c.subscription.payeeName}</div>
            <div className="text-[11px] text-fg-subtle tabular">
              {fmt(c.prevAvg)} → {fmt(c.currentAvg)} · {c.subscription.cadence}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="tabular text-[13px] font-semibold text-warning">
              +{Math.round(c.pctChange * 100)}%
            </div>
            <div className="text-[10.5px] text-fg-subtle tabular">
              +{fmt(c.currentAvg - c.prevAvg)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
