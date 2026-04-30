/**
 * Pre-statement credit utilization alert (Tier 6 #4).
 *
 * Shows above the budget table when any credit card's statement closes
 * within the next 3 days AND its current utilization is >30%. Surfaces
 * the recommended pay-down to drop under 30% before reporting.
 *
 * Per-card dismiss for the rest of the cycle (localStorage); re-shows
 * after the next statement closes.
 */

import { useMemo, useState } from 'react';
import { CreditCard, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeCreditCardSummary } from '../../domain/creditCard';
import { todayIso } from '../../domain/date';
import { useFormatMoney } from '../../lib/format';

const UTIL_TARGET = 0.30;
const DAYS_THRESHOLD = 3;
const DISMISS_KEY = 'monii:cc-util-dismissed';

export function CreditUtilizationAlert() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => readDismissed());

  const alerts = useMemo(() => {
    const today = todayIso();
    const out: Array<{ accountId: string; name: string; utilization: number; balance: number; limit: number; days: number; payToTarget: number }> = [];
    for (const a of accounts) {
      if (a.type !== 'credit' || a.closed) continue;
      const s = computeCreditCardSummary(a, txns, today);
      if (!s.creditLimit) continue;
      if (s.utilization === null) continue;
      if (s.utilization <= UTIL_TARGET) continue;
      const days = s.daysUntilStatement;
      if (days === null || days > DAYS_THRESHOLD) continue;
      const targetBalance = Math.floor(UTIL_TARGET * s.creditLimit);
      const payToTarget = Math.max(0, s.balanceOwed - targetBalance);
      out.push({
        accountId: a.id,
        name: a.name,
        utilization: s.utilization,
        balance: s.balanceOwed,
        limit: s.creditLimit,
        days,
        payToTarget,
      });
    }
    return out;
  }, [accounts, txns]);

  const visible = alerts.filter((a) => dismissed[a.accountId] !== `cycle-${a.days}`);
  if (visible.length === 0) return null;

  function dismiss(accountId: string, days: number) {
    const next = { ...dismissed, [accountId]: `cycle-${days}` };
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <div className="space-y-2">
      {visible.map((a) => (
        <div
          key={a.accountId}
          className="glass-panel ring-1 ring-warning/30 p-3 sm:p-3.5 flex items-start gap-3"
        >
          <CreditCard size={16} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium">
              {a.name} statement closes in {a.days === 0 ? 'today' : `${a.days} day${a.days === 1 ? '' : 's'}`}
            </div>
            <div className="text-[11.5px] text-fg-subtle">
              Utilization {Math.round(a.utilization * 100)}% ({fmt(a.balance)} / {fmt(a.limit)}).
              Pay <strong>{fmt(a.payToTarget)}</strong> to drop under 30% before reporting — credit-score impact.
            </div>
          </div>
          <button
            onClick={() => dismiss(a.accountId, a.days)}
            className="text-fg-subtle hover:text-fg p-1 rounded flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function readDismissed(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}') ?? {}; }
  catch { return {}; }
}
