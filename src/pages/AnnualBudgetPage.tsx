/**
 * Annual budget grid (v0.7.29).
 *
 * Lunch-Money-style "all 12 months at once" view. Each row is a
 * category, each column is a month, and each cell shows the monthly
 * spend total. Helps spot seasonality (summer AC bills, December
 * gift spending) that a single-month view buries.
 *
 * Reuses the existing per-month spend computation rather than
 * inventing a new aggregate. Read-only — for editing assignments,
 * the regular Budget page is still the canonical surface.
 *
 * Year selector at the top defaults to the current year, can step
 * backwards through any year that has data.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { useBudget } from '../store/budget';
import { ACCOUNT_TYPE_META, categoriesTouched } from '../domain/types';
import { useFormatMoney } from '../lib/format';
import { CategoryAvatar } from '../components/ui/CategoryAvatar';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function AnnualBudgetPage() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const [year, setYear] = useState(() => new Date().getFullYear());

  // Compute monthly spend per category for the chosen year. Single
  // walk over txns; cheap even for years with thousands of rows.
  const grid = useMemo(() => {
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const data: Record<string, number[]> = {};
    for (const c of categories) data[c.id] = new Array(12).fill(0);
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (t.oneTime) continue;
      if (!t.date.startsWith(`${year}-`)) continue;
      const monthIdx = parseInt(t.date.slice(5, 7), 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      for (const part of categoriesTouched(t)) {
        if (!part.categoryId) continue;
        if (part.amount >= 0) continue;
        if (!data[part.categoryId]) continue;
        data[part.categoryId][monthIdx] += -part.amount;
      }
    }
    return data;
  }, [accounts, categories, txns, year]);

  // Per-row totals + per-column totals.
  const rows = useMemo(() => {
    const out: Array<{ categoryId: string; categoryName: string; monthly: number[]; total: number }> = [];
    for (const c of categories) {
      if (c.hidden) continue;
      const monthly = grid[c.id] ?? new Array(12).fill(0);
      const total = monthly.reduce((s, v) => s + v, 0);
      if (total === 0) continue; // Skip categories with no activity in this year — keeps the grid scannable.
      out.push({ categoryId: c.id, categoryName: c.name, monthly, total });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [categories, grid]);

  const monthTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const r of rows) for (let i = 0; i < 12; i++) totals[i] += r.monthly[i];
    return totals;
  }, [rows]);

  const yearTotal = monthTotals.reduce((s, v) => s + v, 0);
  const maxCellValue = useMemo(() => {
    let max = 0;
    for (const r of rows) for (const v of r.monthly) if (v > max) max = v;
    return max;
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto">
      <MobilePageHeader
        title="Annual budget"
        subtitle={`${year} · ${fmt(yearTotal)} total spend across ${rows.length} active categor${rows.length === 1 ? 'y' : 'ies'}`}
      />

      <div className="p-3 sm:p-5 space-y-4">
        {/* Year selector */}
        <div className="glass-panel p-3 flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 rounded hover:bg-surface-2 text-fg-subtle hover:text-fg"
            aria-label="Previous year"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex-1 text-center text-[14px] font-semibold tabular">{year}</div>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="p-1.5 rounded hover:bg-surface-2 text-fg-subtle hover:text-fg disabled:opacity-30"
            aria-label="Next year"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <BarChart3 size={36} className="mx-auto text-fg-subtle mb-3" />
            <div className="text-[14px] font-medium mb-1">No data for {year}</div>
            <div className="text-[12px] text-fg-subtle">
              Try a different year, or come back after you've recorded transactions.
            </div>
          </div>
        ) : (
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-[11.5px] tabular">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="text-left font-medium text-fg-subtle px-2 py-2 sticky left-0 bg-surface-2/40 z-10 min-w-[150px]">
                    Category
                  </th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="text-right font-medium text-fg-subtle px-1.5 py-2 min-w-[58px]">
                      {m}
                    </th>
                  ))}
                  <th className="text-right font-semibold text-fg px-2.5 py-2 min-w-[80px] border-l border-border">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cat = categories.find((c) => c.id === r.categoryId);
                  return (
                    <tr key={r.categoryId} className="border-b border-border/40 hover:bg-surface-2/20">
                      <td className="px-2 py-1.5 sticky left-0 bg-bg z-10">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CategoryAvatar
                            customImageDataUrl={cat?.customImageDataUrl ?? null}
                            icon={cat?.icon ?? null}
                            emoji={cat?.emoji ?? null}
                            size={16}
                          />
                          <span className="truncate font-medium text-fg">{r.categoryName}</span>
                        </div>
                      </td>
                      {r.monthly.map((cents, i) => (
                        <td
                          key={i}
                          className="text-right px-1.5 py-1.5"
                          style={{
                            // Heatmap: cells with higher spend get a
                            // stronger accent tint. Quick visual cue
                            // for the year's hottest months without
                            // needing a separate chart.
                            background: cents > 0 && maxCellValue > 0
                              ? `rgb(var(--accent) / ${0.04 + 0.20 * (cents / maxCellValue)})`
                              : undefined,
                          }}
                        >
                          {cents > 0 ? fmt(cents, { showCents: false }) : <span className="text-fg-subtle/50">—</span>}
                        </td>
                      ))}
                      <td className="text-right px-2.5 py-1.5 font-semibold border-l border-border">
                        {fmt(r.total, { showCents: false })}
                      </td>
                    </tr>
                  );
                })}
                {/* Column totals row */}
                <tr className="bg-surface-2/40 sticky bottom-0">
                  <td className="px-2 py-2 font-semibold text-fg-subtle uppercase tracking-wider text-[10.5px] sticky left-0 bg-surface-2/40 z-10">
                    Total
                  </td>
                  {monthTotals.map((cents, i) => (
                    <td key={i} className="text-right px-1.5 py-2 font-semibold tabular">
                      {fmt(cents, { showCents: false })}
                    </td>
                  ))}
                  <td className="text-right px-2.5 py-2 font-bold border-l border-border tabular">
                    {fmt(yearTotal, { showCents: false })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[10.5px] text-fg-subtle text-center">
          Read-only view. To assign or move money, use the Budget page.
        </div>
      </div>
    </div>
  );
}
