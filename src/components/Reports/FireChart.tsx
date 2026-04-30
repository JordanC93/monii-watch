/**
 * FIRE projection chart (Tier 9 #3). Shows the deterministic
 * projection line + Monte Carlo 10/50/90 percentile bands.
 */

import { Line, ComposedChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { useFormatMoney } from '../../lib/format';
import type { MonteCarloResult } from '../../domain/fire';

export function FireChart({
  monte, deterministic, currentAge, targetAge, fireNumber,
}: {
  monte: MonteCarloResult;
  deterministic: number[];
  currentAge: number;
  targetAge: number;
  fireNumber: number;
}) {
  const fmt = useFormatMoney();
  const data = monte.p50.map((_, i) => ({
    age: currentAge + i,
    p10: monte.p10[i],
    p50: monte.p50[i],
    p90: monte.p90[i],
    band: Math.max(0, monte.p90[i] - monte.p10[i]),
    p10Floor: monte.p10[i],
    deterministic: deterministic[i] ?? 0,
  }));

  return (
    <div className="h-64 sm:h-80">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis
            dataKey="age"
            stroke="rgb(var(--fg-subtle))"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--border))' }}
            label={{ value: 'Age', position: 'insideBottom', offset: -4, fill: 'rgb(var(--fg-subtle))', fontSize: 10 }}
          />
          <YAxis
            tickFormatter={(v: number) => fmt(v, { showCents: false })}
            stroke="rgb(var(--fg-subtle))"
            fontSize={10}
            width={70}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--border))' }}
          />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => {
              const labels: Record<string, string> = {
                p10Floor: '10th %',
                band: '10-90th band',
                p50: 'Median',
                deterministic: 'Expected',
              };
              return [fmt(v), labels[name] ?? name];
            }}
            labelFormatter={(age: number) => `Age ${age}`}
          />
          <ReferenceLine y={fireNumber} stroke="rgb(var(--positive))" strokeDasharray="3 3" label={{ value: 'FIRE target', fill: 'rgb(var(--positive))', fontSize: 10, position: 'right' }} />
          <ReferenceLine x={targetAge} stroke="rgb(var(--accent))" strokeDasharray="2 2" label={{ value: 'Retire', fill: 'rgb(var(--accent))', fontSize: 10, position: 'top' }} />
          {/* Stacked area trick: bottom invisible (p10 floor), top fills the band visually. */}
          <Area type="monotone" dataKey="p10Floor" stackId="band" stroke="none" fill="transparent" />
          <Area type="monotone" dataKey="band" stackId="band" stroke="none" fill="rgb(var(--accent))" fillOpacity={0.18} />
          <Line type="monotone" dataKey="p50" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="deterministic" stroke="rgb(var(--fg))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
