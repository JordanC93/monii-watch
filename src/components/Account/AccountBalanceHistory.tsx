/**
 * Account balance history chart (Tier 8 #7). 12-month line chart of the
 * account's running balance.
 */

import { useMemo, useState, lazy, Suspense } from 'react';
import { useBudget } from '../../store/budget';
import { computeMonthlyBalanceHistory } from '../../domain/accountHistory';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';
import type { Account } from '../../domain/types';

const Chart = lazy(() => import('./AccountBalanceChart').then((m) => ({ default: m.AccountBalanceChart })));

const RANGES = [
  { id: 6,  label: '6 mo' },
  { id: 12, label: '12 mo' },
  { id: 24, label: '2 yr' },
];

export function AccountBalanceHistory({ account }: { account: Account }) {
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const [months, setMonths] = useState(12);

  const points = useMemo(
    () => computeMonthlyBalanceHistory(account, txns, months, todayIso()),
    [account, txns, months],
  );

  const min = Math.min(...points.map((p) => p.balance), 0);
  const max = Math.max(...points.map((p) => p.balance), 0);
  const cur = points[points.length - 1]?.balance ?? 0;
  const start = points[0]?.balance ?? 0;
  const change = cur - start;

  return (
    <div className="glass-panel p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[13px] font-semibold">Balance over time</div>
          <div className="text-[11.5px] text-fg-subtle">
            {months}-month trail. {change >= 0 ? '+' : ''}{fmt(change)} change.
          </div>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setMonths(r.id)}
              aria-pressed={months === r.id}
              className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${
                months === r.id ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="h-40 grid place-items-center text-fg-subtle text-[12px]">Loading chart…</div>}>
        <Chart points={points} />
      </Suspense>
      <div className="grid grid-cols-3 gap-2 text-[11.5px]">
        <div className="bg-surface-2/40 rounded-md p-2">
          <div className="text-fg-subtle">Start</div>
          <div className="tabular font-medium">{fmt(start)}</div>
        </div>
        <div className="bg-surface-2/40 rounded-md p-2">
          <div className="text-fg-subtle">Highest</div>
          <div className="tabular font-medium">{fmt(max)}</div>
        </div>
        <div className="bg-surface-2/40 rounded-md p-2">
          <div className="text-fg-subtle">Lowest</div>
          <div className="tabular font-medium">{fmt(min)}</div>
        </div>
      </div>
    </div>
  );
}
