/**
 * Overdraft predictor banner (Tier 6 #17).
 *
 * Surfaces above the Budget table when the cash-flow forecast detects
 * a negative-balance day within the next 7 days. Soft-dismiss for the
 * day; re-shows on the next session even if dismissed.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useEffectiveScheduled, useEffectiveMonthlyIncome } from '../../store/sandboxSelectors';
import { computeForecast } from '../../domain/forecast';
import { useFormatMoney } from '../../lib/format';
import { todayIso, formatDate } from '../../domain/date';
import { setSettingsField } from '../../db/repo';

const HORIZON_DAYS = 7;

export function OverdraftBanner() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useEffectiveScheduled();
  const monthlyIncome = useEffectiveMonthlyIncome();
  const dismissedAt = useBudget((s) => s.settings.overdraftBannerDismissedAt ?? 0);
  const fmt = useFormatMoney();
  const [localDismiss, setLocalDismiss] = useState(false);

  const overdraftDay = useMemo(() => {
    const points = computeForecast(accounts, txns, scheduled, monthlyIncome, {
      horizonDays: HORIZON_DAYS,
      today: todayIso(),
    });
    for (const p of points) {
      if (p.projected < 0) return p;
    }
    return null;
  }, [accounts, txns, scheduled, monthlyIncome]);

  if (!overdraftDay) return null;
  if (localDismiss) return null;
  // Persistent dismiss only suppresses for the rest of today (ms-since-dismissal < 6hrs).
  const dismissedAgo = Date.now() - dismissedAt;
  if (dismissedAt > 0 && dismissedAgo < 6 * 60 * 60 * 1000) return null;

  function dismiss() {
    setLocalDismiss(true);
    setSettingsField('overdraftBannerDismissedAt', Date.now());
  }

  return (
    <div className="glass-panel ring-1 ring-negative/40 p-3 sm:p-3.5 flex items-start gap-3">
      <AlertTriangle size={16} className="text-negative flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-negative">
          You'll go negative on {formatDate(overdraftDay.date)}
        </div>
        <div className="text-[11.5px] text-fg-subtle">
          Projected balance: {fmt(overdraftDay.projected)}. Pull from savings, postpone a bill, or earn income before then.
        </div>
      </div>
      <button
        onClick={dismiss}
        className="text-fg-subtle hover:text-fg p-1 rounded flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
