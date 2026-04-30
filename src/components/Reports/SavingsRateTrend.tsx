/**
 * Savings rate trend chart (Tier 8 #10). Line chart of monthly
 * savings rate over the trailing 12 months.
 */

import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useBudget } from '../../store/budget';
import { computeSavingsRateTrend } from '../../domain/runway';
import { todayIso } from '../../domain/date';
import { useFormatMoney } from '../../lib/format';

export function SavingsRateTrend() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const points = useMemo(
    () => computeSavingsRateTrend(accounts, txns, 12, todayIso()),
    [accounts, txns],
  );

  const chartData = points.map((p) => ({
    month: p.month,
    label: format(parseISO(`${p.month}-01`), 'MMM yy'),
    rate: p.rate !== null ? Math.round(p.rate * 100) : null,
    income: p.income,
    outflow: p.outflow,
    net: p.net,
  }));

  const validRates = points.map((p) => p.rate).filter((r) => r !== null) as number[];
  const avgRate = validRates.length > 0
    ? validRates.reduce((s, r) => s + r, 0) / validRates.length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[24px] font-semibold tabular">
          {validRates.length > 0 ? `${Math.round(avgRate * 100)}%` : '—'}
        </div>
        <div className="text-[11.5px] text-fg-subtle">
          12-month average savings rate. ≥20% = strong; under 5% = below typical.
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
            <XAxis dataKey="label" stroke="rgb(var(--fg-subtle))" fontSize={10} tickLine={false} axisLine={{ stroke: 'rgb(var(--border))' }} />
            <YAxis tickFormatter={(v: number) => `${v}%`} stroke="rgb(var(--fg-subtle))" fontSize={10} width={40} tickLine={false} axisLine={{ stroke: 'rgb(var(--border))' }} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, name: string) => {
                if (name === 'rate') return [v === null ? 'No income' : `${v}%`, 'Savings rate'];
                return [fmt(v), name];
              }}
            />
            <ReferenceLine y={20} stroke="rgb(var(--positive))" strokeDasharray="3 3" label={{ value: '20%', fill: 'rgb(var(--fg-subtle))', fontSize: 10, position: 'right' }} />
            <ReferenceLine y={0} stroke="rgb(var(--fg-subtle))" strokeDasharray="2 2" />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'rgb(var(--accent))' }}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
