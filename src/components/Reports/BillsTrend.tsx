/**
 * Bills / spending trend over time. Lets the user pick which categories to
 * track (defaults to all categories with a Scheduled template — those are
 * almost always the recurring bills) and renders a multi-series line chart
 * of monthly total *outflow* per category, plus a small table below with
 * the average / latest / month-over-month delta per series.
 *
 * Why this is useful: utility bills change month-to-month (heating in
 * winter, AC in summer, surge pricing on water in dry seasons). The user
 * asked for a way to see how spending in a single envelope evolves over
 * the year — this is that view, generalized so they can apply it to
 * anything (gas, groceries, dining).
 */

import { useMemo, useState } from 'react';
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { categoriesTouched, type Category } from '../../domain/types';
import { addMonths, format, parseISO } from 'date-fns';
import { Check, Receipt } from 'lucide-react';
import { cn } from '../../lib/cn';

const SERIES_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

export function BillsTrend({ months = 12 }: { months?: number }) {
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useBudget((s) => s.scheduled);
  const fmt = useFormatMoney();

  // Default selection: every category that has a recurring/scheduled
  // template attached. Falls back to top-5-spent over the window if there
  // are no scheduled templates yet.
  const defaultSelected = useMemo(() => {
    const fromScheduled = new Set<string>();
    for (const s of scheduled) {
      if (s.categoryId) fromScheduled.add(s.categoryId);
    }
    if (fromScheduled.size > 0) return fromScheduled;
    // Fallback — top-5-spent in the chosen window.
    const totals = new Map<string, number>();
    const cutoff = format(addMonths(new Date(), -months), 'yyyy-MM');
    for (const t of txns) {
      if (t.transferAccountId) continue;
      if (t.date.slice(0, 7) < cutoff) continue;
      for (const part of categoriesTouched(t)) {
        if (!part.categoryId) continue;
        if (part.amount >= 0) continue; // only outflows
        totals.set(part.categoryId, (totals.get(part.categoryId) ?? 0) + -part.amount);
      }
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    return new Set(top);
  }, [scheduled, txns, months]);

  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  // Re-pick defaults when the user adds their first scheduled template
  // (or when the txn set changes from empty to non-empty). Without this
  // the chart stays empty for new users.
  if (selected.size === 0 && defaultSelected.size > 0) {
    setSelected(defaultSelected);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build the wide-format monthly series.
  const chartData = useMemo(() => {
    const today = new Date();
    const out: Array<Record<string, any>> = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = format(addMonths(today, -i), 'yyyy-MM');
      const row: Record<string, any> = { month: m };
      for (const id of selected) row[id] = 0;
      for (const t of txns) {
        if (t.transferAccountId) continue;
        if (t.date.slice(0, 7) !== m) continue;
        for (const part of categoriesTouched(t)) {
          if (!part.categoryId) continue;
          if (!selected.has(part.categoryId)) continue;
          if (part.amount >= 0) continue;
          row[part.categoryId] = (row[part.categoryId] ?? 0) + -part.amount;
        }
      }
      out.push(row);
    }
    return out;
  }, [txns, selected, months]);

  // Per-series stats for the table below the chart.
  const stats = useMemo(() => {
    return [...selected].map((id) => {
      const cat = categories.find((c) => c.id === id);
      const series = chartData.map((r) => (r[id] as number) ?? 0);
      const nonzero = series.filter((v) => v > 0);
      const avg = nonzero.length ? Math.round(nonzero.reduce((a, b) => a + b, 0) / nonzero.length) : 0;
      const latest = series[series.length - 1] ?? 0;
      const prev = series[series.length - 2] ?? 0;
      const delta = latest - prev;
      const high = Math.max(...series);
      return { id, name: cat?.name ?? '?', avg, latest, prev, delta, high };
    });
  }, [chartData, selected, categories]);

  // Build the chooser list. Sort: scheduled-first, then by recent spend.
  const chooserCats = useMemo(() => {
    const scheduledSet = new Set(scheduled.map((s) => s.categoryId).filter(Boolean) as string[]);
    const recentSpend = new Map<string, number>();
    const cutoff = format(addMonths(new Date(), -months), 'yyyy-MM');
    for (const t of txns) {
      if (t.transferAccountId) continue;
      if (t.date.slice(0, 7) < cutoff) continue;
      for (const part of categoriesTouched(t)) {
        if (!part.categoryId || part.amount >= 0) continue;
        recentSpend.set(part.categoryId, (recentSpend.get(part.categoryId) ?? 0) + -part.amount);
      }
    }
    const list = categories
      .filter((c) => !c.hidden)
      .map((c) => ({ ...c, _hasScheduled: scheduledSet.has(c.id), _spend: recentSpend.get(c.id) ?? 0 }));
    list.sort((a, b) => {
      if (a._hasScheduled !== b._hasScheduled) return a._hasScheduled ? -1 : 1;
      return b._spend - a._spend;
    });
    return list;
  }, [categories, scheduled, txns, months]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-[12px] text-fg-muted mb-1.5 flex items-center gap-1">
            <Receipt size={12} />
            <span>Tracking <strong className="text-fg">{selected.size}</strong> categor{selected.size === 1 ? 'y' : 'ies'} over the past {months} months.</span>
          </div>
          <div className="text-[11px] text-fg-subtle">
            Defaulted to your scheduled / recurring categories. Add or remove any below.
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {selected.size === 0 ? (
          <div className="h-full grid place-items-center text-[12px] text-fg-subtle border border-dashed border-border rounded-md">
            Pick a category to start tracking.
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => format(parseISO(`${m}-01`), 'MMM')}
                stroke="rgb(var(--fg-subtle))"
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v) => fmt(v, { showCents: false })}
                stroke="rgb(var(--fg-subtle))"
                fontSize={11}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--surface))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, key: string) => {
                  const cat = categories.find((c) => c.id === key);
                  return [fmt(v), cat?.name ?? key];
                }}
                labelFormatter={(m) => format(parseISO(`${m}-01`), 'MMMM yyyy')}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => categories.find((c) => c.id === value)?.name ?? value}
              />
              {[...selected].map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-series stats */}
      {stats.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-fg-subtle">
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-2">Category</th>
                <th className="text-right py-1.5 px-2">Avg / mo</th>
                <th className="text-right py-1.5 px-2">Latest</th>
                <th className="text-right py-1.5 px-2">Δ vs prev</th>
                <th className="text-right py-1.5 pl-2">High</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 truncate flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                    {s.name}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular">{fmt(s.avg)}</td>
                  <td className="text-right py-1.5 px-2 tabular">{fmt(s.latest)}</td>
                  <td className={cn('text-right py-1.5 px-2 tabular', s.delta > 0 ? 'text-negative' : s.delta < 0 ? 'text-positive' : 'text-fg-subtle')}>
                    {s.delta === 0 ? '—' : (s.delta > 0 ? '+' : '') + fmt(s.delta)}
                  </td>
                  <td className="text-right py-1.5 pl-2 tabular text-fg-muted">{fmt(s.high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category chooser */}
      <details>
        <summary className="cursor-pointer text-[11.5px] text-fg-subtle hover:text-fg">
          Pick categories to track ({selected.size} of {chooserCats.length})
        </summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {chooserCats.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={cn(
                'text-[12px] px-2 py-1 rounded border flex items-center gap-1.5 text-left',
                selected.has(c.id)
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-border text-fg-muted hover:bg-surface-2/40',
              )}
              title={c._hasScheduled ? 'Has a scheduled / recurring template' : ''}
            >
              <span className="w-3 h-3 grid place-items-center flex-shrink-0">
                {selected.has(c.id) && <Check size={10} className="text-accent" />}
              </span>
              <span className="truncate">{c.name}</span>
              {c._hasScheduled && <Receipt size={10} className="text-accent flex-shrink-0" />}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
