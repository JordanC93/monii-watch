/**
 * Per-household-member spending breakdown (Tier 14 — couples mode).
 * Shows total outflow per member over the selected window, plus a
 * "shared / no attribution" row for transactions without `enteredBy`.
 *
 * Hidden when no household members are configured (solo mode).
 */

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { categoriesTouched } from '../../domain/types';
import { addMonths, format } from 'date-fns';
import { isoIsInMonth } from '../../domain/date';
import { ReportExportButtons } from './ReportExportButtons';

export function HouseholdBreakdown({ months = 1 }: { months?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  // Iron Rule #21 — pull raw, default in useMemo. `?? []` inline creates
  // a fresh array per render and triggers a useSyncExternalStore loop.
  const membersRaw = useBudget((s) => s.settings.householdMembers);
  const members = useMemo(() => membersRaw ?? [], [membersRaw]);
  const fmt = useFormatMoney();

  const data = useMemo(() => {
    if (members.length === 0) return null;
    const today = new Date();
    const monthsList = Array.from({ length: months }, (_, i) => format(addMonths(today, -i), 'yyyy-MM'));
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const totals = new Map<string, number>();
    let unattributed = 0;
    let totalOut = 0;
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (!monthsList.some((m) => isoIsInMonth(t.date, m))) continue;
      let outflow = 0;
      for (const part of categoriesTouched(t)) {
        if (part.amount < 0) outflow += -part.amount;
      }
      if (outflow === 0) continue;
      totalOut += outflow;
      if (t.enteredBy && members.find((m) => m.id === t.enteredBy)) {
        totals.set(t.enteredBy, (totals.get(t.enteredBy) ?? 0) + outflow);
      } else {
        unattributed += outflow;
      }
    }
    return { totals, unattributed, totalOut };
  }, [accounts, txns, members, months]);

  if (!data) return null;
  const { totals, unattributed, totalOut } = data;
  if (totalOut === 0) {
    return <div className="p-4 text-fg-subtle text-[13px] text-center">No spending in the selected window.</div>;
  }

  const csvRows: string[][] = [
    ['Member', 'Spent', 'Share %'],
    ...members.map((m) => [
      m.name,
      ((totals.get(m.id) ?? 0) / 100).toFixed(2),
      `${((totals.get(m.id) ?? 0) / totalOut * 100).toFixed(1)}%`,
    ]),
    ['Unattributed', (unattributed / 100).toFixed(2), `${(unattributed / totalOut * 100).toFixed(1)}%`],
  ];

  return (
    <div data-print-scope="household-breakdown">
      <div className="flex items-center mb-2">
        <span className="text-[11.5px] text-fg-subtle">
          {months === 1 ? 'This month' : `Last ${months} months`} · {fmt(totalOut)} total
        </span>
        <span className="ml-auto">
          <ReportExportButtons
            filename="household-breakdown"
            csvRows={csvRows}
            printScope="household-breakdown"
          />
        </span>
      </div>
      <div className="space-y-2">
        {members.map((m) => {
          const spent = totals.get(m.id) ?? 0;
          const pct = totalOut > 0 ? (spent / totalOut) * 100 : 0;
          return (
            <div key={m.id} className="flex items-center gap-3">
              <Users
                size={14}
                className={`flex-shrink-0 ${m.color ? `text-flag-${m.color}` : 'text-fg-muted'}`}
              />
              <span className="text-[12.5px] font-medium min-w-[100px] truncate">{m.name}</span>
              <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full ${m.color ? `bg-flag-${m.color}` : 'bg-accent'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[12px] tabular text-fg-muted w-20 text-right">{fmt(spent)}</span>
              <span className="text-[10.5px] text-fg-subtle w-12 text-right tabular">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
        {unattributed > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-border/40">
            <Users size={14} className="flex-shrink-0 text-fg-subtle" />
            <span className="text-[12.5px] italic text-fg-subtle min-w-[100px]">Unattributed</span>
            <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-fg-subtle/40"
                style={{ width: `${(unattributed / totalOut) * 100}%` }}
              />
            </div>
            <span className="text-[12px] tabular text-fg-subtle w-20 text-right">{fmt(unattributed)}</span>
            <span className="text-[10.5px] text-fg-subtle w-12 text-right tabular">{((unattributed / totalOut) * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
