/**
 * 12-month bar chart for the CategoryDetail page (Tier 7 #4).
 * Shows current-year months with optional last-year overlay so the
 * user can see seasonal patterns at a glance.
 */

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useFormatMoney } from '../../lib/format';
import type { MonthlySpend } from '../../domain/categoryDetail';
import { formatMonthShort } from '../../domain/categoryDetail';

export function CategoryDetailChart({
  monthly,
  monthlyLastYear,
}: {
  monthly: MonthlySpend[];
  monthlyLastYear: MonthlySpend[];
}) {
  const fmt = useFormatMoney();

  const data = monthly.map((m, i) => ({
    month: m.month,
    label: formatMonthShort(m.month),
    cur: m.cents,
    last: monthlyLastYear[i]?.cents ?? 0,
  }));

  return (
    <div className="h-56 sm:h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis
            dataKey="label"
            stroke="rgb(var(--fg-subtle))"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--border))' }}
          />
          <YAxis
            tickFormatter={(v: number) => fmt(v, { showCents: false })}
            stroke="rgb(var(--fg-subtle))"
            fontSize={10}
            width={60}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--border))' }}
          />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [fmt(v), name === 'cur' ? 'This year' : 'Last year']}
            labelFormatter={(label: string) => label}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => value === 'cur' ? 'This year' : 'Last year'} />
          <Bar dataKey="last" fill="rgb(var(--fg-subtle))" radius={[3, 3, 0, 0]} fillOpacity={0.35} />
          <Bar dataKey="cur" fill="rgb(var(--accent))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
