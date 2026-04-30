/**
 * Hard-limit warning banner (Tier 9 #7). Surfaces above the budget
 * table when any category with a hard limit is at velocity-warn,
 * near-limit, or over.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeLimitStatuses } from '../../domain/hardLimits';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';

export function HardLimitsBanner() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const month = useBudget((s) => s.selectedMonth);
  const limitsRaw = useBudget((s) => s.settings.hardSpendingLimits);
  const fmt = useFormatMoney();

  const statuses = useMemo(() => {
    return computeLimitStatuses(accounts, txns, limitsRaw, month, todayIso());
  }, [accounts, txns, limitsRaw, month]);

  const visible = statuses.filter((s) => s.state !== 'ok');
  const [expanded, setExpanded] = useState(false);
  if (visible.length === 0) return null;

  const tone =
    visible.some((v) => v.state === 'over') ? 'ring-negative/40 text-negative' :
    visible.some((v) => v.state === 'near-limit') ? 'ring-warning/40 text-warning' :
    'ring-warning/30 text-warning';

  return (
    <div className={`glass-panel ring-1 ${tone} p-3 sm:p-3.5`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 text-left"
      >
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium">
            {visible.length} categor{visible.length === 1 ? 'y is' : 'ies are'} hitting your hard limit
          </div>
          <div className="text-[11.5px] text-fg-subtle">
            Hard limits flag overspending earlier than envelope rollover. Tap to review.
          </div>
        </div>
        <ChevronRight
          size={14}
          className={`text-fg-subtle flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="space-y-1.5 mt-2 pt-2 border-t border-border">
          {visible.map((s) => {
            const cat = categories.find((c) => c.id === s.categoryId);
            if (!cat) return null;
            const stateLabel =
              s.state === 'over' ? 'Over limit' :
              s.state === 'near-limit' ? 'Near limit' :
              'Spending too fast';
            return (
              <div key={s.categoryId} className="flex items-center gap-2 text-[12px] py-1">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{cat.name}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {fmt(s.spentCents)} of {fmt(s.limitCents)} ({Math.round(s.pct * 100)}%)
                    {s.showVelocityAlert && ` · spending ${s.velocity.toFixed(1)}× faster than pace`}
                  </div>
                </div>
                <div className="text-[10.5px] font-medium uppercase tracking-wide">{stateLabel}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
