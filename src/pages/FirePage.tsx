/**
 * FIRE / retirement planner page (Tier 9 #3). Pure derivation from
 * existing data + user-entered FIRE assumptions in Settings.
 *
 * Sections:
 *   - Setup card (link if not configured yet)
 *   - "Your FIRE numbers" card with 25×/33×/20× targets
 *   - Deterministic projection chart
 *   - Monte Carlo chart (10/50/90 percentile bands)
 *   - Success probability + glide guidance
 *   - Withdrawal sequencing recommendation
 */

import { useMemo, useState, lazy, Suspense } from 'react';
import { Flame, TrendingUp, AlertTriangle, ChevronRight, Settings as Cog } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { setSettingsField } from '../db/repo';
import { computeAccountBalances, computeNetWorth, computeMonthStats } from '../domain/budget';
import {
  computeFireTarget, projectDeterministic, monteCarloSimulate,
  fireInputsFromSettings, WITHDRAWAL_SEQUENCE,
} from '../domain/fire';
import { useFormatMoney } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import { parseAmountToCents } from '../domain/calc';

const FireChart = lazy(() => import('../components/Reports/FireChart').then((m) => ({ default: m.FireChart })));

export function FirePage() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();

  // Derive current NW + annual contribution from existing data.
  const balances = computeAccountBalances(accounts, txns);
  const nw = computeNetWorth(balances);

  // Annual contribution = trailing 12-month net (income - outflow).
  const annualContribution = useMemo(() => {
    const today = new Date();
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const stats = computeMonthStats(accounts, txns, m, settings.currency, settings.fxSnapshots ?? []);
      total += Math.max(0, stats.net);
    }
    return total;
  }, [accounts, txns, settings.currency, settings.fxSnapshots]);

  const inputs = fireInputsFromSettings(settings, nw.total, annualContribution);

  if (!inputs) {
    return (
      <div className="max-w-3xl mx-auto">
        <MobilePageHeader title="FIRE planner" subtitle="Retirement projection" />
        <div className="p-3 sm:p-5 space-y-4">
          <FireSetupCard />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary variant="route" scope="fire">
      <FirePageContent
        inputs={inputs}
        netWorth={nw.total}
        annualContribution={annualContribution}
      />
    </ErrorBoundary>
  );
}

function FirePageContent({ inputs, netWorth, annualContribution }: {
  inputs: ReturnType<typeof fireInputsFromSettings> & object;
  netWorth: number;
  annualContribution: number;
}) {
  const fmt = useFormatMoney();
  const settings = useBudget((s) => s.settings);

  const target = computeFireTarget(inputs.targetAnnualSpending);
  const projection = useMemo(() => projectDeterministic(inputs), [inputs]);
  const monte = useMemo(() => monteCarloSimulate(inputs, 500), [inputs]);

  const fireProgress = Math.min(1, netWorth / target.fireNumber25x);
  const yearsLeft = inputs.targetRetirementAge - inputs.currentAge;
  const onTrack = projection.netWorthAtRetirement >= target.fireNumber25x;

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title="FIRE planner"
        subtitle={`Age ${inputs.currentAge} · Target ${inputs.targetRetirementAge} (${yearsLeft} yrs)`}
      />

      <div className="p-3 sm:p-5 space-y-4">
        <FireSetupCard collapsed />

        {/* Your FIRE numbers */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <Flame size={14} className="text-accent" /> Your FIRE numbers
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            How much you'd need invested today to retire and live on {fmt(inputs.targetAnnualSpending)}/year.
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FireTargetTile label="Lean (3% rule)" value={fmt(target.leanFireNumber)} note="Conservative — sustains 40+ yr retirement" />
            <FireTargetTile label="FIRE (4% rule)" value={fmt(target.fireNumber25x)} note="Trinity Study standard" emphasized />
            <FireTargetTile label="Fat (5% rule)" value={fmt(target.fatFireNumber)} note="Aggressive — shorter horizon" />
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-fg-subtle">Progress to FIRE (25×)</span>
              <span className="tabular font-medium">{Math.round(fireProgress * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.min(100, fireProgress * 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-fg-subtle mt-1.5">
              {fmt(netWorth)} of {fmt(target.fireNumber25x)} · {fmt(target.fireNumber25x - netWorth)} to go
            </div>
          </div>
        </div>

        {/* Projection summary */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-accent" /> Projection at retirement age
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Projected NW at age {inputs.targetRetirementAge}</div>
              <div className={`text-[20px] font-semibold tabular ${onTrack ? 'text-positive' : 'text-warning'}`}>
                {fmt(projection.netWorthAtRetirement)}
              </div>
              <div className="text-[11px] text-fg-subtle mt-0.5">
                at {Math.round(inputs.expectedReturnPct * 100)}% expected return
              </div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Annual contribution</div>
              <div className="text-[20px] font-semibold tabular">{fmt(annualContribution)}</div>
              <div className="text-[11px] text-fg-subtle mt-0.5">trailing 12-month net</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Monte Carlo success</div>
              <div className={`text-[20px] font-semibold tabular ${monte.successProbability >= 0.85 ? 'text-positive' : monte.successProbability >= 0.7 ? 'text-warning' : 'text-negative'}`}>
                {Math.round(monte.successProbability * 100)}%
              </div>
              <div className="text-[11px] text-fg-subtle mt-0.5">{monte.trials} simulations</div>
            </div>
          </div>
          {!onTrack && (
            <div className="mt-3 p-3 bg-warning/10 rounded-md ring-1 ring-warning/30 flex items-start gap-2">
              <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
              <div className="text-[11.5px] text-fg-muted">
                At your current pace, you'll reach <strong>{fmt(projection.netWorthAtRetirement)}</strong> by
                age {inputs.targetRetirementAge} — short of the {fmt(target.fireNumber25x)} target. Either
                save more, plan for a later retirement, or reduce the spending target.
              </div>
            </div>
          )}
          {projection.ranOutOfMoney && (
            <div className="mt-3 p-3 bg-negative/10 rounded-md ring-1 ring-negative/30 flex items-start gap-2">
              <AlertTriangle size={14} className="text-negative flex-shrink-0 mt-0.5" />
              <div className="text-[11.5px] text-fg-muted">
                Deterministic projection runs out of money at age {inputs.currentAge + projection.ranOutInYear}.
                Consider lowering retirement spending or raising contributions.
              </div>
            </div>
          )}
        </div>

        {/* Monte Carlo chart */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-1">Monte Carlo simulation</div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            {monte.trials} runs at {Math.round(inputs.expectedReturnPct * 100)}% mean / {Math.round(inputs.expectedStdevPct * 100)}% stdev.
            The shaded band is the 10th-90th percentile range; the dark line is the median.
          </div>
          <Suspense fallback={<div className="h-64 grid place-items-center text-fg-subtle text-[12px]">Loading chart…</div>}>
            <FireChart
              monte={monte}
              deterministic={projection.yearly}
              currentAge={inputs.currentAge}
              targetAge={inputs.targetRetirementAge}
              fireNumber={target.fireNumber25x}
            />
          </Suspense>
        </div>

        {/* Withdrawal sequencing */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-1">Withdrawal sequencing</div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Tax-efficient drawdown order in retirement. Pull from these buckets in this order to minimize lifetime tax.
          </div>
          <ol className="space-y-2">
            {WITHDRAWAL_SEQUENCE.map((item, i) => (
              <li key={item.bucket} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-accent/15 text-accent grid place-items-center text-[11px] font-semibold flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium capitalize">{item.bucket.replace('_', ' ')}</div>
                  <div className="text-[11.5px] text-fg-subtle">{item.rationale}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FireTargetTile({ label, value, note, emphasized }: { label: string; value: string; note?: string; emphasized?: boolean }) {
  return (
    <div className={`bg-surface-2/40 rounded-md p-2.5 ring-1 ${emphasized ? 'ring-accent/40' : 'ring-border'}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`tabular ${emphasized ? 'text-[16px] text-accent' : 'text-[14px]'} font-semibold mt-0.5`}>{value}</div>
      {note && <div className="text-[10.5px] text-fg-subtle mt-0.5 leading-snug">{note}</div>}
    </div>
  );
}

/**
 * Setup card. When `collapsed` is true, just shows a short summary
 * with an "Edit" button to expand. When false (default), renders
 * the full setup form.
 */
function FireSetupCard({ collapsed = false }: { collapsed?: boolean }) {
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const [expanded, setExpanded] = useState(!collapsed);

  if (collapsed && !expanded) {
    return (
      <div className="glass-panel p-3 flex items-center gap-2">
        <Cog size={13} className="text-fg-subtle" />
        <div className="flex-1 min-w-0 text-[12px] text-fg-subtle">
          Tap "Edit" to change FIRE assumptions
        </div>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(true)}>Edit</Button>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 sm:p-5 space-y-3">
      <div className="text-[14px] font-semibold flex items-center gap-1.5">
        <Cog size={14} /> FIRE assumptions
      </div>
      <div className="text-[11.5px] text-fg-subtle">
        These power the projection. Update when your situation changes — they're saved
        automatically.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SetupField label="Your current age">
          <Input
            type="number"
            value={settings.fireCurrentAge ?? ''}
            onChange={(e) => setSettingsField('fireCurrentAge', e.target.value ? parseInt(e.target.value, 10) : undefined)}
            placeholder="35"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Target retirement age">
          <Input
            type="number"
            value={settings.fireTargetAge ?? ''}
            onChange={(e) => setSettingsField('fireTargetAge', e.target.value ? parseInt(e.target.value, 10) : undefined)}
            placeholder="60"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Annual spending in retirement">
          <Input
            value={settings.fireTargetAnnualSpending ? (settings.fireTargetAnnualSpending / 100).toString() : ''}
            onChange={(e) => {
              const cents = parseAmountToCents(e.target.value);
              setSettingsField('fireTargetAnnualSpending', cents !== null && cents > 0 ? cents : undefined);
            }}
            inputMode="decimal"
            placeholder="60000.00"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Expected return % per year">
          <Input
            type="number"
            step="0.1"
            value={settings.fireExpectedReturnPct ? (settings.fireExpectedReturnPct * 100).toString() : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setSettingsField('fireExpectedReturnPct', Number.isFinite(v) && v > 0 ? v / 100 : undefined);
            }}
            placeholder="7"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Return std deviation %">
          <Input
            type="number"
            step="0.1"
            value={settings.fireExpectedStdevPct ? (settings.fireExpectedStdevPct * 100).toString() : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setSettingsField('fireExpectedStdevPct', Number.isFinite(v) && v > 0 ? v / 100 : undefined);
            }}
            placeholder="15"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Inflation % per year">
          <Input
            type="number"
            step="0.1"
            value={settings.fireExpectedInflationPct ? (settings.fireExpectedInflationPct * 100).toString() : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setSettingsField('fireExpectedInflationPct', Number.isFinite(v) && v >= 0 ? v / 100 : undefined);
            }}
            placeholder="3"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Life expectancy">
          <Input
            type="number"
            value={settings.fireLifeExpectancy ?? ''}
            onChange={(e) => setSettingsField('fireLifeExpectancy', e.target.value ? parseInt(e.target.value, 10) : undefined)}
            placeholder="90"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="Social Security start age (optional)">
          <Input
            type="number"
            value={settings.fireSocialSecurityStartAge ?? ''}
            onChange={(e) => setSettingsField('fireSocialSecurityStartAge', e.target.value ? parseInt(e.target.value, 10) : undefined)}
            placeholder="67"
            className="text-right tabular"
          />
        </SetupField>
        <SetupField label="SS expected monthly benefit (optional)">
          <Input
            value={settings.fireSocialSecurityMonthly ? (settings.fireSocialSecurityMonthly / 100).toString() : ''}
            onChange={(e) => {
              const cents = parseAmountToCents(e.target.value);
              setSettingsField('fireSocialSecurityMonthly', cents !== null && cents > 0 ? cents : undefined);
            }}
            inputMode="decimal"
            placeholder="2000.00"
            className="text-right tabular"
          />
        </SetupField>
      </div>
      {collapsed && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setExpanded(false)}>Collapse</Button>
        </div>
      )}
    </div>
  );
}

function SetupField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11.5px] text-fg-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
