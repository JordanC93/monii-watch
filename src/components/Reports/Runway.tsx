/**
 * Runway / burn-rate card (Tier 8 #9). "If income stops today, how
 * many months of cash do you have?"
 */

import { useMemo } from 'react';
import { Hourglass } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeRunway } from '../../domain/runway';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';

export function Runway() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const r = useMemo(() => computeRunway(accounts, txns, 6, todayIso()), [accounts, txns]);

  const mTone =
    r.monthsRunway === null ? 'text-fg-subtle' :
    r.monthsRunway >= 6 ? 'text-positive' :
    r.monthsRunway >= 3 ? 'text-warning' :
    'text-negative';

  const mLabel =
    r.monthsRunway === null ? 'No spending data' :
    r.monthsRunway >= 240 ? '20+ years' :
    r.monthsRunway >= 12 ? `${(r.monthsRunway / 12).toFixed(1)} years` :
    `${r.monthsRunway.toFixed(1)} months`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Hourglass size={20} className={mTone} />
        <div>
          <div className={`text-[24px] font-semibold tabular ${mTone}`}>{mLabel}</div>
          <div className="text-[11.5px] text-fg-subtle">
            of liquid runway if income stopped today
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Tile label="Cash on hand" value={fmt(r.cashOnHand)} />
        <Tile label="Avg monthly burn" value={fmt(r.monthlyBurnAvg)} note={`Last ${r.lookbackMonths} mo · excludes one-time`} />
        <Tile label="Avg monthly net" value={fmt(r.monthlyNetAvg)} tone={r.monthlyNetAvg >= 0 ? 'positive' : 'negative'} />
      </div>
      <div className="text-[11px] text-fg-subtle italic">
        "Liquid" = checking + savings + cash. Credit limits are NOT runway —
        they're future debt. Investments aren't included unless you sell them.
      </div>
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  const text =
    tone === 'positive' ? 'text-positive' :
    tone === 'negative' ? 'text-negative' :
    'text-fg';
  return (
    <div className="bg-surface-2/40 rounded-md p-2.5 ring-1 ring-border">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`tabular text-[15px] font-semibold mt-0.5 ${text}`}>{value}</div>
      {note && <div className="text-[10.5px] text-fg-subtle mt-0.5">{note}</div>}
    </div>
  );
}
