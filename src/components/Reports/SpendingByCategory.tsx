import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { isoIsInMonth, parseMonth } from '../../domain/date';
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useFormatMoney } from '../../lib/format';
import { addMonths, format } from 'date-fns';
import { categoriesTouched } from '../../domain/types';

const PALETTE = [
  '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185',
  '#60a5fa', '#f472b6', '#84cc16', '#fb923c', '#c084fc',
  '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#10b981',
];

export function SpendingByCategory({ months = 1 }: { months?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const data = useMemo(() => {
    const today = new Date();
    const monthsList = Array.from({ length: months }, (_, i) => format(addMonths(today, -i), 'yyyy-MM'));
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const map = new Map<string, number>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (!monthsList.some((m) => isoIsInMonth(t.date, m))) continue;
      for (const part of categoriesTouched(t)) {
        if (part.amount >= 0) continue; // only outflows
        if (!part.categoryId) continue;
        const cat = categories.find((c) => c.id === part.categoryId);
        const key = cat?.name ?? 'Uncategorized';
        map.set(key, (map.get(key) ?? 0) + (-part.amount));
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [accounts, txns, categories, months]);

  const total = data.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return <div className="p-6 text-fg-subtle text-[13px] text-center">No spending recorded for the selected period.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-center">
      <div className="h-64 relative">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={1} stroke="rgb(var(--bg))">
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => fmt(v)}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Spent</div>
          <div className="text-[16px] font-semibold tabular">{fmt(total)}</div>
        </div>
      </div>
      <div className="text-[12.5px]">
        {data.slice(0, 12).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 px-2 py-1 hover:bg-surface-2/40 rounded">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="tabular text-fg-muted">{fmt(d.value)}</span>
            <span className="tabular text-fg-subtle text-[11px] w-10 text-right">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {data.length > 12 && (
          <div className="text-[11px] text-fg-subtle px-2 py-1">+{data.length - 12} more categories</div>
        )}
      </div>
    </div>
  );
}
