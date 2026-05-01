/**
 * Cash flow forecast chart.
 *
 * Line for the projected on-budget balance + a shaded confidence band
 * + dots on days where a scheduled transaction lands. Surfaces a
 * "you'll go negative around <date>" warning when the projection
 * dips below zero in the horizon.
 *
 * Pure projection — see src/domain/forecast.ts for methodology.
 */

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { useBudget } from '../../store/budget';
import { useEffectiveScheduled, useEffectiveMonthlyIncome } from '../../store/sandboxSelectors';
import { computeForecast } from '../../domain/forecast';
import { useFormatMoney } from '../../lib/format';
import { format, parseISO } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

const HORIZONS = [
  { id: 30,  label: '30 days' },
  { id: 60,  label: '60 days' },
  { id: 90,  label: '90 days' },
  { id: 180, label: '6 months' },
];

export function CashFlowForecast() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useEffectiveScheduled();
  const monthlyIncome = useEffectiveMonthlyIncome();
  const fmt = useFormatMoney();
  const [horizon, setHorizon] = useState(60);

  const points = useMemo(
    () => computeForecast(accounts, txns, scheduled, monthlyIncome, { horizonDays: horizon }),
    [accounts, txns, scheduled, monthlyIncome, horizon],
  );

  // Earliest day where projection dips negative — warning trigger.
  const goesNegative = points.find((p) => p.projected < 0);

  // Reduce data for charts: convert cents to dollars for the Y axis +
  // pre-compute band as area between low/high so recharts can stack.
  const chartData = useMemo(() => points.map((p) => ({
    date: p.date,
    projected: p.projected / 100,
    low: p.low / 100,
    range: (p.high - p.low) / 100,
    hasScheduled: p.hasScheduled,
  })), [points]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[12px] text-fg-muted">
          Projection of on-budget balance using scheduled transactions + your trailing 60-day spending average
          {monthlyIncome > 0 && <> + {fmt(monthlyIncome)}/mo income</>}.
        </div>
        <div className="flex items-center gap-1">
          {HORIZONS.map((h) => (
            <Button
              key={h.id}
              size="sm"
              variant={horizon === h.id ? 'primary' : 'secondary'}
              onClick={() => setHorizon(h.id)}
            >{h.label}</Button>
          ))}
        </div>
      </div>

      {goesNegative && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/40 text-[12.5px]">
          <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-warning">Heads up: projected to go negative</div>
            <div className="text-fg-muted">
              Around <strong>{format(parseISO(goesNegative.date), 'MMM d')}</strong>, your on-budget balance is projected to dip below zero. Consider deferring a non-essential bill, slowing variable spend, or moving funds in.
            </div>
          </div>
        </div>
      )}

      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(parseISO(d), 'MMM d')}
              stroke="rgb(var(--fg-subtle))"
              fontSize={11}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => fmt(Math.round(v * 100), { showCents: false })}
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
                if (key === 'range') return [null, null]; // hide stacked area key
                return [fmt(Math.round(v * 100)), 'Projected balance'];
              }}
              labelFormatter={(d) => format(parseISO(d), 'EEEE, MMM d')}
            />
            <ReferenceLine y={0} stroke="rgb(239, 68, 68)" strokeDasharray="3 3" />
            {/* Confidence band — stacked area trick */}
            <Area type="monotone" dataKey="low" stackId="band" stroke="none" fill="transparent" />
            <Area type="monotone" dataKey="range" stackId="band" stroke="none" fill="rgb(var(--accent))" fillOpacity={0.12} />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              dot={(props: any) => {
                if (!props.payload?.hasScheduled) return <g />;
                return <circle cx={props.cx} cy={props.cy} r={3} fill="rgb(var(--warning))" stroke="none" />;
              }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[10.5px] text-fg-subtle">
        Yellow dots mark days a scheduled transaction lands. Shaded band widens further out to reflect growing uncertainty. Projection ignores one-off events not already in your scheduled list.
      </div>
    </div>
  );
}
