/**
 * Emergency-fund linkage panel (Tier 6 #11). Pick a category to be
 * the "emergency fund" + choose 3 / 6 / 12 month targets.
 */

import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { Select } from '../ui/Select';
import { HelpHint } from '../ui/HelpHint';
import { useFormatMoney } from '../../lib/format';
import { useMemo } from 'react';
import type { Account, Transaction } from '../../domain/types';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { todayIso } from '../../domain/date';

export function EmergencyFundSettings() {
  const settings = useBudget((s) => s.settings);
  // Pull raw, derive in render with useMemo. Filtering inside the
  // Zustand selector returns a new array each call, which trips
  // React 18's useSyncExternalStore "snapshot is unstable" check
  // and causes "Maximum update depth exceeded".
  const allCategories = useBudget((s) => s.categories);
  const categories = useMemo(() => allCategories.filter((c) => !c.hidden), [allCategories]);
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const trailingMonthlyOutflow = useMemo(() => {
    return computeTrailingMonthlyOutflow(accounts, txns);
  }, [accounts, txns]);

  const targetMonths = settings.emergencyFundMonths || 3;
  const targetCents = Math.round(trailingMonthlyOutflow * targetMonths);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            Target months of expenses
            <HelpHint title="Target Months">
              How many months of your normal spending you want stashed
              for emergencies. 3 months covers most short-term shocks; 6
              months is the most-recommended starting point; 9 to 12 is
              conservative and fits self-employed or single-income
              households.
            </HelpHint>
          </label>
          <Select
            value={String(targetMonths)}
            onChange={(e) => setSettingsField('emergencyFundMonths', parseInt(e.target.value, 10))}
            className="text-[12.5px] mt-1"
          >
            <option value="3">3 months (basic)</option>
            <option value="6">6 months (recommended)</option>
            <option value="9">9 months</option>
            <option value="12">12 months (conservative)</option>
          </Select>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            Linked category
            <HelpHint title="Linked Category">
              The envelope you're using as your emergency fund. Once
              linked, the Goals page shows a special tile tracking your
              progress toward the target above. Leave unlinked if you'd
              rather just see a target suggestion.
            </HelpHint>
          </label>
          <Select
            value={settings.emergencyFundCategoryId ?? ''}
            onChange={(e) => setSettingsField('emergencyFundCategoryId', e.target.value || undefined)}
            className="text-[12.5px] mt-1"
          >
            <option value="">(none, show suggestion only)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="bg-surface-2/40 rounded-md p-3 ring-1 ring-border text-[12px]">
        <div className="text-fg-subtle">Right-sized target based on your trailing 3-mo outflow:</div>
        <div className="text-[15px] font-semibold tabular mt-0.5">
          {trailingMonthlyOutflow > 0 ? fmt(targetCents) : '—'}
        </div>
        <div className="text-fg-subtle text-[11.5px] mt-0.5">
          {trailingMonthlyOutflow > 0
            ? `${fmt(Math.round(trailingMonthlyOutflow))}/mo × ${targetMonths} months. The Goals page surfaces a "Right-sized emergency fund" tile pinned to the top.`
            : 'Add some transactions and we\'ll compute your target.'}
        </div>
      </div>
    </div>
  );
}

export function computeTrailingMonthlyOutflow(accounts: Account[], txns: Transaction[]): number {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const today = todayIso();
  const cutoff = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();
  let outflow = 0;
  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue; // exclude one-time outliers (Tier 6 #9)
    if (t.date < cutoff || t.date > today) continue;
    if (t.amount < 0) outflow += -t.amount;
  }
  return outflow / 3; // monthly average
}
