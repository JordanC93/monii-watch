/**
 * Year-over-year month side-by-side (Tier 14 #5).
 *
 * Pick a month (defaults to the current month). Shows that month
 * in 4 different years (current + 3 prior) side by side per category,
 * so the user can spot category drift across time.
 *
 * Pure derivation from the existing transaction data — no new
 * schema. Honors `Settings.currency` + multi-currency FX snapshots.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { categoriesTouched } from '../../domain/types';
import { ReportExportButtons } from './ReportExportButtons';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function YearMonthCompare() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const today = new Date();
  const [pickedMonth, setPickedMonth] = useState<number>(today.getMonth()); // 0-11

  const yearsBack = 3;
  const baseYear = today.getFullYear();
  const years = useMemo(() => {
    const out: number[] = [];
    for (let i = yearsBack; i >= 0; i--) out.push(baseYear - i);
    return out;
  }, [baseYear]);

  const data = useMemo(() => {
    // Build a map: categoryName → { year → spendCents }.
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const byCategory = new Map<string, Map<number, number>>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      const d = new Date(t.date + 'T00:00:00');
      if (d.getMonth() !== pickedMonth) continue;
      const yr = d.getFullYear();
      if (!years.includes(yr)) continue;
      for (const part of categoriesTouched(t)) {
        if (part.amount >= 0) continue; // outflows only
        const cat = part.categoryId ? categories.find((c) => c.id === part.categoryId) : null;
        const name = cat?.name ?? 'Uncategorized';
        const map = byCategory.get(name) ?? new Map<number, number>();
        map.set(yr, (map.get(yr) ?? 0) + (-part.amount));
        byCategory.set(name, map);
      }
    }
    // Sort by current-year spend descending; categories with no
    // current-year spend fall to the bottom.
    return Array.from(byCategory.entries())
      .map(([name, m]) => ({
        name,
        byYear: years.map((yr) => m.get(yr) ?? 0),
      }))
      .sort((a, b) => b.byYear[b.byYear.length - 1] - a.byYear[a.byYear.length - 1]);
  }, [accounts, txns, categories, pickedMonth, years]);

  const totals = years.map((_, i) => data.reduce((s, r) => s + r.byYear[i], 0));

  // CSV rows for the export button.
  const csvRows = useMemo(() => {
    const header = ['Category', ...years.map((y) => `${MONTH_NAMES[pickedMonth]} ${y}`)];
    const body = data.map((r) => [r.name, ...r.byYear.map((c) => (c / 100).toFixed(2))]);
    const totalsRow = ['Total', ...totals.map((c) => (c / 100).toFixed(2))];
    return [header, ...body, totalsRow];
  }, [data, years, pickedMonth, totals]);

  return (
    <div data-print-scope="year-over-year">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11.5px] text-fg-subtle">Month:</span>
        <select
          value={pickedMonth}
          onChange={(e) => setPickedMonth(parseInt(e.target.value, 10))}
          className="text-[12px] bg-surface-2 border border-border rounded px-2 py-1"
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <span className="ml-auto">
          <ReportExportButtons
            filename={`year-over-year-${MONTH_NAMES[pickedMonth].toLowerCase()}`}
            csvRows={csvRows}
            printScope="year-over-year"
          />
        </span>
      </div>

      {data.length === 0 ? (
        <div className="text-[12.5px] text-fg-subtle text-center py-6">
          No spending in {MONTH_NAMES[pickedMonth]} for any of the selected years.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular">
            <thead>
              <tr className="border-b border-border text-fg-subtle">
                <th className="text-left py-1.5 px-2 font-medium">Category</th>
                {years.map((y) => (
                  <th key={y} className="text-right py-1.5 px-2 font-medium">{MONTH_NAMES[pickedMonth]} {y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 12).map((r) => {
                const latest = r.byYear[r.byYear.length - 1];
                const prior = r.byYear[r.byYear.length - 2] || 0;
                const delta = prior > 0 ? Math.round(((latest - prior) / prior) * 100) : null;
                return (
                  <tr key={r.name} className="border-b border-border/40 hover:bg-surface-2/30">
                    <td className="py-1.5 px-2 truncate max-w-[180px]">{r.name}</td>
                    {r.byYear.map((c, i) => {
                      const isLatest = i === r.byYear.length - 1;
                      return (
                        <td key={i} className={`py-1.5 px-2 text-right ${isLatest ? 'font-medium' : 'text-fg-muted'}`}>
                          {c > 0 ? fmt(c) : <span className="text-fg-subtle/60">—</span>}
                          {isLatest && delta !== null && delta !== 0 && (
                            <span className={`ml-1.5 text-[10.5px] ${delta > 0 ? 'text-warning' : 'text-positive'}`}>
                              {delta > 0 ? '+' : ''}{delta}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 px-2">Total</td>
                {totals.map((c, i) => (
                  <td key={i} className="py-2 px-2 text-right">{fmt(c)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
