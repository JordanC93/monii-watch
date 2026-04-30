/**
 * Financial Health Scorecard report card (Tier 6 #2).
 *
 * Six dimensions, color-coded with a one-line action suggestion. Reads
 * `domain/financialHealth.ts` directly — purely derived from existing
 * data, no schema changes.
 */

import { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeHealthScore, type HealthBand, type HealthIndicator } from '../../domain/financialHealth';

export function FinancialHealth() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const settings = useBudget((s) => s.settings);

  const scorecard = useMemo(
    () => computeHealthScore(accounts, txns, payees, settings),
    [accounts, txns, payees, settings],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`text-[28px] font-semibold tabular ${toneText(scorecard.band)}`}>
          {scorecard.overall}
        </div>
        <div>
          <div className="text-[12px] text-fg-subtle">Overall</div>
          <div className={`text-[13px] font-medium ${toneText(scorecard.band)}`}>
            {bandLabel(scorecard.band)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {scorecard.indicators.map((ind) => (
          <IndicatorTile key={ind.id} ind={ind} />
        ))}
      </div>
    </div>
  );
}

function IndicatorTile({ ind }: { ind: HealthIndicator }) {
  return (
    <div className={`bg-surface-2/40 rounded-md p-2.5 ring-1 ${toneRing(ind.band)}`}>
      <div className="flex items-center gap-2">
        <BandIcon band={ind.band} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-fg-subtle uppercase tracking-wide">{ind.label}</div>
          <div className="text-[14px] font-semibold tabular">{ind.value}</div>
        </div>
      </div>
      <div className="text-[11.5px] text-fg-muted mt-1.5 leading-snug">{ind.suggestion}</div>
    </div>
  );
}

function BandIcon({ band }: { band: HealthBand }) {
  if (band === 'green') return <CheckCircle2 size={16} className="text-positive flex-shrink-0" />;
  if (band === 'yellow') return <Activity size={16} className="text-warning flex-shrink-0" />;
  if (band === 'red') return <AlertTriangle size={16} className="text-negative flex-shrink-0" />;
  return <MinusCircle size={16} className="text-fg-subtle flex-shrink-0" />;
}

function toneText(band: HealthBand): string {
  if (band === 'green') return 'text-positive';
  if (band === 'yellow') return 'text-warning';
  if (band === 'red') return 'text-negative';
  return 'text-fg-subtle';
}

function toneRing(band: HealthBand): string {
  if (band === 'green') return 'ring-positive/30';
  if (band === 'yellow') return 'ring-warning/30';
  if (band === 'red') return 'ring-negative/30';
  return 'ring-border';
}

function bandLabel(band: HealthBand): string {
  if (band === 'green') return 'Strong';
  if (band === 'yellow') return 'OK';
  if (band === 'red') return 'Needs attention';
  return 'Not enough data yet';
}
