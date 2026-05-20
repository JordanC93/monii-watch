/**
 * Banner above the budget table showing days-until-next-paycheck +
 * cash on hand + safe daily spend rate (Tier 6 #3).
 *
 * Hidden when pay schedule isn't set. Tap to expand details.
 */

import { useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useEffectiveScheduled } from '../../store/sandboxSelectors';
import { computeSafeSpend } from '../../domain/safeSpend';
import { todayIso } from '../../domain/date';
import { useFormatMoney, useFormatDate } from '../../lib/format';

export function SafeToSpendBanner() {
  const formatDate = useFormatDate();
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useEffectiveScheduled();
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();

  const [expanded, setExpanded] = useState(false);

  const spend = useMemo(() => {
    return computeSafeSpend(accounts, txns, scheduled, settings, todayIso());
  }, [accounts, txns, scheduled, settings]);

  // Only show when pay schedule is set — otherwise the math is meaningless.
  if (settings.payFrequency === 'unset') return null;
  if (!spend.nextPaycheckIso) return null;
  if (!spend.ready) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="glass-panel p-3 sm:p-3.5 ring-1 ring-accent/30 w-full text-left flex items-start gap-3"
    >
      <Calendar size={16} className="text-accent flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium">
          {spend.daysUntilPaycheck === 0
            ? 'Payday is today'
            : `${spend.daysUntilPaycheck} day${spend.daysUntilPaycheck === 1 ? '' : 's'} until your next paycheck`}
          {' · '}
          <span className="tabular text-positive">{fmt(spend.perDay)}/day safe-to-spend</span>
        </div>
        {!expanded && (
          <div className="text-[11.5px] text-fg-subtle">
            {fmt(spend.spendable)} after upcoming bills · paycheck {formatDate(spend.nextPaycheckIso)}
          </div>
        )}
        {expanded && (
          <div className="text-[11.5px] text-fg-subtle space-y-0.5 mt-1">
            <div>Cash on hand: <span className="tabular">{fmt(spend.cashOnHand)}</span></div>
            <div>Upcoming scheduled bills: <span className="tabular">{fmt(spend.upcomingBills)}</span></div>
            <div>Spendable: <span className="tabular">{fmt(spend.spendable)}</span></div>
            <div className="pt-1">Next paycheck: {formatDate(spend.nextPaycheckIso)}</div>
            <div className="text-[11px] italic mt-1">
              Excludes credit-card limits; only liquid balances. Scheduled outflows from now to payday are subtracted.
            </div>
          </div>
        )}
      </div>
      {expanded ? <ChevronUp size={14} className="text-fg-subtle flex-shrink-0" /> : <ChevronDown size={14} className="text-fg-subtle flex-shrink-0" />}
    </button>
  );
}
