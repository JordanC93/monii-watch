/**
 * "What if" scenario modeling. Two side-by-side cash-flow forecasts:
 * baseline (your actual current pace) and scenario (with the user's
 * adjustments applied). Lets the user answer "what if I cut dining
 * by 50%?" or "what if I lose $1,000/mo of income?" without committing
 * any changes to the actual data.
 *
 * Implemented as overlays on the existing forecast engine — see
 * `domain/forecast.ts → ForecastOptions.variableSpendMultiplier` and
 * `extraMonthlyIncome`. No new data shape; just two computations
 * with different parameters.
 */

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { useBudget } from '../../store/budget';
import { computeForecast } from '../../domain/forecast';
import { useFormatMoney } from '../../lib/format';
import { format, parseISO } from 'date-fns';
import { Sliders, TrendingDown, TrendingUp } from 'lucide-react';

const HORIZON_DAYS = 90;

export function WhatIf() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useBudget((s) => s.scheduled);
  const monthlyIncome = useBudget((s) => s.settings.monthlyIncome);
  const fmt = useFormatMoney();

  // Scenario sliders.
  const [spendPct, setSpendPct] = useState(100);          // % of current variable spend (50–150%)
  const [extraIncomeText, setExtraIncomeText] = useState(''); // additional or lost monthly income (cents); negative = loss

  const baseline = useMemo(
    () => computeForecast(accounts, txns, scheduled, monthlyIncome, { horizonDays: HORIZON_DAYS }),
    [accounts, txns, scheduled, monthlyIncome],
  );
  const extraIncome = parseFloat(extraIncomeText.replace(/[$,]/g, '')) * 100 || 0;
  const scenario = useMemo(
    () => computeForecast(accounts, txns, scheduled, monthlyIncome, {
      horizonDays: HORIZON_DAYS,
      variableSpendMultiplier: spendPct / 100,
      extraMonthlyIncome: extraIncome,
    }),
    [accounts, txns, scheduled, monthlyIncome, spendPct, extraIncome],
  );

  const chartData = useMemo(() => baseline.map((b, i) => ({
    date: b.date,
    baseline: b.projected / 100,
    scenario: scenario[i]?.projected / 100,
  })), [baseline, scenario]);

  // Empty baseline means we don't have enough data to forecast yet —
  // bail with a placeholder rather than render NaN'd numbers.
  if (baseline.length === 0 || scenario.length === 0) {
    return (
      <div className="text-[12.5px] text-fg-subtle text-center py-8">
        Need at least one on-budget account with transactions to model a scenario.
      </div>
    );
  }

  const baselineEnd = baseline[baseline.length - 1].projected;
  const scenarioEnd = scenario[scenario.length - 1].projected;
  const diff = scenarioEnd - baselineEnd;
  const baselineFirstNeg = baseline.find((p) => p.projected < 0);
  const scenarioFirstNeg = scenario.find((p) => p.projected < 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <Sliders size={13} className="text-accent" />
        Drag the sliders to model how your forecast changes. Nothing is saved — this is a sandbox.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-2/40 rounded-lg p-3">
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-[12px] font-medium">Variable spending</label>
            <span className="text-[13px] tabular font-semibold text-accent">{spendPct}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={150}
            step={5}
            value={spendPct}
            onChange={(e) => setSpendPct(parseInt(e.target.value, 10))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-fg-subtle tabular mt-0.5">
            <span>50% (cut in half)</span>
            <span>100% (no change)</span>
            <span>150% (50% more)</span>
          </div>
        </div>
        <div className="bg-surface-2/40 rounded-lg p-3">
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-[12px] font-medium">Extra monthly income</label>
            <span className="text-[13px] tabular font-semibold text-accent">{extraIncome >= 0 ? '+' : ''}{fmt(extraIncome)}/mo</span>
          </div>
          <input
            value={extraIncomeText}
            onChange={(e) => setExtraIncomeText(e.target.value)}
            placeholder="0 (e.g. 500 or -1000)"
            inputMode="decimal"
            className="w-full bg-transparent text-[13px] tabular text-right border-b border-border focus:outline-none focus:border-accent py-1 px-1"
          />
          <div className="text-[10px] text-fg-subtle mt-0.5">
            Positive = raise / side income; negative = job loss simulation.
          </div>
        </div>
      </div>

      {/* Outcome summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2/40 rounded-lg p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Baseline ({HORIZON_DAYS}d)</div>
          <div className="text-[18px] font-semibold tabular mt-0.5">{fmt(baselineEnd)}</div>
          {baselineFirstNeg && (
            <div className="text-[11px] text-warning">Goes negative {format(parseISO(baselineFirstNeg.date), 'MMM d')}</div>
          )}
        </div>
        <div className="bg-surface-2/40 rounded-lg p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Scenario ({HORIZON_DAYS}d)</div>
          <div className={`text-[18px] font-semibold tabular mt-0.5 ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
            {fmt(scenarioEnd)}
          </div>
          <div className={`text-[11px] tabular ${diff >= 0 ? 'text-positive' : 'text-negative'} flex items-center gap-1`}>
            {diff >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {diff >= 0 ? '+' : ''}{fmt(diff)} vs baseline
          </div>
          {scenarioFirstNeg && (
            <div className="text-[11px] text-warning">Goes negative {format(parseISO(scenarioFirstNeg.date), 'MMM d')}</div>
          )}
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
            <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'MMM d')} stroke="rgb(var(--fg-subtle))" fontSize={11} minTickGap={28} />
            <YAxis tickFormatter={(v) => fmt(Math.round(v * 100), { showCents: false })} stroke="rgb(var(--fg-subtle))" fontSize={11} width={70} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => fmt(Math.round(v * 100))}
              labelFormatter={(d) => format(parseISO(d), 'EEEE, MMM d')}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="rgb(239, 68, 68)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="baseline" name="Baseline" stroke="rgb(var(--fg-subtle))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
