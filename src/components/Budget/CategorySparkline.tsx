/**
 * Tiny inline 6-month spending mini-chart for budget rows.
 *
 * Pure SVG — no Recharts dependency, so it doesn't bloat the budget
 * hot-path bundle (Recharts is lazy-loaded only on Reports). Renders as
 * a 60×16 px sparkline showing the last 6 months of activity for this
 * category. Desktop only — mobile rows don't have horizontal room.
 */

import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { isoIsInMonth, shiftMonth } from '../../domain/date';

export function CategorySparkline({ categoryId, month }: { categoryId: string; month: string }) {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);

  const series = useMemo(() => {
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const out: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      let s = 0;
      for (const t of txns) {
        if (!onBudgetIds.has(t.accountId)) continue;
        if (t.transferAccountId) continue;
        if (!isoIsInMonth(t.date, m)) continue;
        if (t.amount >= 0) continue;
        if (t.categoryId === categoryId) s += -t.amount;
        else for (const sp of t.splits) if (sp.categoryId === categoryId) s += -sp.amount;
      }
      out.push(s);
    }
    return out;
  }, [txns, accounts, categoryId, month]);

  const max = Math.max(...series, 100);
  const allZero = series.every((v) => v === 0);

  if (allZero) {
    return <span className="hidden lg:inline-block w-[60px] h-3 opacity-25 text-fg-subtle text-[9px]">—</span>;
  }

  const w = 60, h = 16;
  const step = w / (series.length - 1);
  const points = series.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="hidden lg:inline-block opacity-70"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={h - (series[series.length - 1] / max) * (h - 2) - 1}
        r={1.5}
        fill="currentColor"
      />
    </svg>
  );
}
