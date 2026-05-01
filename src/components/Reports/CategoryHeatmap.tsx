/**
 * Year × category heatmap. Top 8 spending categories rendered as
 * rows; the past 12 months as columns. Each cell color-shaded by
 * spend in that category in that month, scaled per-row so seasonal
 * patterns are visible (Heating jumps in Dec/Jan, AC jumps in Jul).
 */

import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { ACCOUNT_TYPE_META, categoriesTouched } from '../../domain/types';
import { useFormatMoney } from '../../lib/format';
import { format, parseISO } from 'date-fns';

export function CategoryHeatmap() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const { months, rows } = useMemo(() => {
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const today = new Date();
    const monthList: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Per-cat per-month spent map
    const cellMap = new Map<string, Map<string, number>>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      const m = t.date.slice(0, 7);
      if (!monthList.includes(m)) continue;
      for (const part of categoriesTouched(t)) {
        if (!part.categoryId || part.amount >= 0) continue;
        let row = cellMap.get(part.categoryId);
        if (!row) { row = new Map(); cellMap.set(part.categoryId, row); }
        row.set(m, (row.get(m) ?? 0) + -part.amount);
      }
    }

    // Sort categories by total over the window, take top 8
    const totals = new Map<string, number>();
    for (const [catId, byMonth] of cellMap) {
      let s = 0;
      for (const v of byMonth.values()) s += v;
      totals.set(catId, s);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const built = ranked.map(([catId]) => {
      const cat = categories.find((c) => c.id === catId);
      const byMonth = cellMap.get(catId)!;
      const cells = monthList.map((m) => byMonth.get(m) ?? 0);
      const max = Math.max(...cells, 1);
      return {
        catId,
        catName: cat?.name ?? '?',
        cells,
        max,
        total: totals.get(catId) ?? 0,
      };
    });
    return { months: monthList, rows: built };
  }, [accounts, categories, txns]);

  if (rows.length === 0) {
    return <div className="text-[12.5px] text-fg-subtle text-center py-6">Need at least a few months of categorized transactions to draw a heatmap.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-px text-[10.5px]" style={{ gridTemplateColumns: `140px repeat(${months.length}, minmax(36px, 1fr)) 64px` }}>
        {/* Header row */}
        <div />
        {months.map((m) => (
          <div key={m} className="text-center text-fg-subtle font-medium tabular py-1">
            {format(parseISO(m + '-01'), 'MMM')}
          </div>
        ))}
        <div className="text-right text-fg-subtle font-medium pr-1 py-1">Total</div>
        {/* Data rows */}
        {rows.map((row) => (
          <div key={row.catId} className="contents">
            <div className="text-fg-muted truncate py-1.5 pr-2 font-medium">{row.catName}</div>
            {row.cells.map((value, i) => {
              const intensity = value / row.max;
              return (
                <div
                  key={i}
                  className="h-7 rounded-sm flex items-center justify-center font-medium tabular cursor-default"
                  style={{
                    backgroundColor: value > 0
                      ? `rgba(239, 68, 68, ${0.10 + intensity * 0.55})`
                      : 'rgb(var(--surface-2) / 0.4)',
                    color: intensity > 0.45 ? 'rgba(255, 255, 255, 0.95)' : 'rgb(var(--fg-subtle))',
                  }}
                  title={`${row.catName} · ${format(parseISO(months[i] + '-01'), 'MMMM yyyy')}: ${fmt(value)}`}
                >
                  {value > 0 ? fmt(value, { showCents: false }).replace(/\$/, '') : ''}
                </div>
              );
            })}
            <div className="text-right pr-1 py-1.5 tabular text-fg-muted font-medium">{fmt(row.total, { showCents: false })}</div>
          </div>
        ))}
      </div>
      <div className="text-[10.5px] text-fg-subtle mt-2">Heat scaled per row, so columns within a row are comparable, but a "dark" Dining cell isn't directly comparable to a "dark" Mortgage cell.</div>
    </div>
  );
}
