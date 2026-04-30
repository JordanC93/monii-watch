/**
 * Net-worth attribution card (Tier 6 #12).
 *
 * Decomposes month-over-month net-worth change into Saved / Investments /
 * Debt / Other.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { computeNwAttribution } from '../../domain/nwAttribution';
import { useFormatMoney } from '../../lib/format';
import { thisMonthIso } from '../../domain/date';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function NetWorthAttribution() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const snapshots = useBudget((s) => s.nwSnapshots);
  const fmt = useFormatMoney();
  const [month, setMonth] = useState(thisMonthIso());

  const att = useMemo(
    () => computeNwAttribution(accounts, txns, snapshots, month),
    [accounts, txns, snapshots, month],
  );

  const Icon = att.delta >= 0 ? TrendingUp : TrendingDown;
  const tone = att.delta >= 0 ? 'text-positive' : 'text-negative';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] flex-wrap">
        <span className="text-fg-subtle">Month:</span>
        {[0, 1, 2].map((offset) => {
          const m = shiftMonth(thisMonthIso(), -offset);
          return (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-medium ${m === month ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg'}`}
            >
              {m}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Icon size={20} className={tone} />
        <div>
          <div className={`text-[18px] font-semibold tabular ${tone}`}>
            {att.delta >= 0 ? '+' : ''}{fmt(att.delta)}
          </div>
          <div className="text-[11.5px] text-fg-subtle">
            {att.delta >= 0 ? 'Net worth grew' : 'Net worth dropped'} in {month}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="You saved" value={fmt(att.saved)} tone={att.saved >= 0 ? 'positive' : 'negative'} />
        <Tile label="Investments" value={fmt(att.investments)} tone="accent" />
        <Tile label="Debt paid down" value={fmt(att.debt)} tone={att.debt >= 0 ? 'positive' : 'negative'} />
        <Tile label="Other" value={fmt(att.other)} tone="neutral" />
      </div>
      <div className="text-[10.5px] text-fg-subtle italic">
        "Saved" = income minus on-budget spending. "Debt" = reduction in credit-card / loan balances. Investment market gains require historical price data we don't track yet.
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: 'positive' | 'negative' | 'accent' | 'neutral' }) {
  const ring = tone === 'positive' ? 'ring-positive/30' : tone === 'negative' ? 'ring-negative/30' : tone === 'accent' ? 'ring-accent/30' : 'ring-border';
  const text = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : tone === 'accent' ? 'text-accent' : 'text-fg';
  return (
    <div className={`bg-surface-2/40 rounded-md p-2.5 ring-1 ${ring}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`tabular text-[13px] font-medium ${text}`}>{value}</div>
    </div>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
