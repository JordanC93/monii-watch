/**
 * Year-over-year report (Tier 6 #5). Top movers by absolute change in
 * YTD spend.
 */

import { useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeYoY } from '../../domain/yearOverYear';
import { todayIso } from '../../domain/date';
import { useFormatMoney } from '../../lib/format';

export function YearOverYear() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const rows = useMemo(
    () => computeYoY(accounts, categories, txns, todayIso()),
    [accounts, categories, txns],
  );

  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-fg-subtle text-center py-3">
        Not enough data yet. Add some transactions and check back next year.
      </div>
    );
  }

  // Show top 12 movers; the rest are background noise.
  const visible = rows.slice(0, 12);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_64px_64px_56px] sm:grid-cols-[1fr_80px_80px_80px] gap-2 text-[10px] sm:text-[10.5px] uppercase tracking-wide text-fg-subtle pb-1 border-b border-border/50">
        <div></div>
        <div className="text-right">Last YTD</div>
        <div className="text-right">This YTD</div>
        <div className="text-right">Change</div>
      </div>
      {visible.map((r) => {
        const up = r.diff > 0;
        const flat = r.lastYear === 0 && r.thisYear === 0;
        const tone = flat
          ? 'text-fg-subtle'
          : up
          ? 'text-warning'
          : 'text-positive';
        const Icon = flat ? null : up ? ArrowUp : ArrowDown;
        return (
          <div
            key={r.categoryId}
            className="grid grid-cols-[1fr_64px_64px_56px] sm:grid-cols-[1fr_80px_80px_80px] gap-2 items-center text-[11.5px] sm:text-[12px] py-1 border-b border-border/50 last:border-0"
          >
            <div className="font-medium truncate">{r.categoryName}</div>
            <div className="tabular text-right text-fg-subtle">{fmt(r.lastYear)}</div>
            <div className="tabular text-right">{fmt(r.thisYear)}</div>
            <div className={`tabular text-right flex items-center justify-end gap-0.5 ${tone}`}>
              {Icon && <Icon size={10} />}
              {r.lastYear > 0
                ? `${r.pctChange > 0 ? '+' : ''}${Math.round(r.pctChange * 100)}%`
                : (r.thisYear > 0 ? 'new' : '—')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
