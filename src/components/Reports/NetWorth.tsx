import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useFormatMoney } from '../../lib/format';
import { addMonths, format, parseISO } from 'date-fns';
import { ACCOUNT_TYPE_META } from '../../domain/types';

export function NetWorth({ months = 12 }: { months?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const snapshots = useBudget((s) => s.nwSnapshots);
  const useNwSnapshots = useBudget((s) => s.settings.useNwSnapshots);
  const taxRate = useBudget((s) => s.settings.netWorthAfterTaxRate);
  const fmt = useFormatMoney();

  const data = useMemo(() => {
    // Snapshot-driven path: O(snapshots × months), no big recompute.
    // We pick the most-recent snapshot in each month (or the closest
    // before it for sparse history). Falls back to live-recompute when
    // there are no snapshots yet (fresh install).
    if (useNwSnapshots && snapshots.length > 0) {
      const today = new Date();
      const points: Array<{ month: string; assets: number; liabilities: number; net: number }> = [];
      for (let i = months - 1; i >= 0; i--) {
        const monthEnd = format(addMonths(today, -i), 'yyyy-MM');
        const cutoff = `${monthEnd}-31`;
        // Most recent snapshot at or before cutoff for this month.
        let pick = null as null | { date: string; total: number; onB?: number; tr?: number };
        for (const s of snapshots) {
          if (s.date > cutoff) break;
          if (!pick || s.date > pick.date) pick = { date: s.date, total: s.totalCents, onB: s.onBudgetCents, tr: s.trackingCents };
        }
        if (pick) {
          // Approximate split — onBudget often ~ assets, tracking ~ liabilities mix.
          // For visualization simplicity, we treat positive contributors as
          // assets and negative as liabilities by recomputing once.
          const balances = new Map<string, number>();
          for (const a of accounts) balances.set(a.id, 0);
          for (const t of txns) {
            if (t.date <= cutoff) balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + t.amount);
          }
          let assets = 0, liab = 0;
          for (const a of accounts) {
            if (a.closed) continue;
            const b = balances.get(a.id) ?? 0;
            if (b >= 0) assets += b;
            else liab += -b;
          }
          points.push({ month: monthEnd, assets, liabilities: liab, net: pick.total });
        } else {
          points.push({ month: monthEnd, assets: 0, liabilities: 0, net: 0 });
        }
      }
      return points;
    }

    // Fallback: live recompute (legacy path).
    const today = new Date();
    const points: Array<{ month: string; assets: number; liabilities: number; net: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthEnd = format(addMonths(today, -i), 'yyyy-MM');
      const cutoff = `${monthEnd}-31`;
      const balances = new Map<string, number>();
      for (const a of accounts) balances.set(a.id, 0);
      for (const t of txns) {
        if (t.date <= cutoff) {
          balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + t.amount);
        }
      }
      let assets = 0, liab = 0;
      for (const a of accounts) {
        if (a.closed) continue;
        const b = balances.get(a.id) ?? 0;
        if (b >= 0) assets += b;
        else liab += -b;
      }
      points.push({ month: monthEnd, assets, liabilities: liab, net: assets - liab });
    }
    return points;
  }, [accounts, txns, months, snapshots, useNwSnapshots]);

  // After-tax net worth: tax-deferred accounts (401k, traditional IRA)
  // get haircut by `taxRate`; everything else passes through.
  const afterTax = useMemo(() => {
    const now = data[data.length - 1]?.net ?? 0;
    let deferred = 0;
    for (const a of accounts) {
      if (a.closed) continue;
      if (!ACCOUNT_TYPE_META[a.type].onBudget) {
        if (a.taxStatus === '401k' || a.taxStatus === 'traditional_ira') {
          // approximate balance from txns
          let bal = 0;
          for (const t of txns) if (t.accountId === a.id) bal += t.amount;
          if (bal > 0) deferred += bal;
        }
      }
    }
    return now - Math.round(deferred * taxRate);
  }, [accounts, txns, data, taxRate]);

  const last = data[data.length - 1];
  const showAfterTax = afterTax !== last?.net;

  return (
    <div>
      <div className={`grid ${showAfterTax ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-3 mb-3`}>
        <Stat label="Net Worth" value={fmt(last?.net ?? 0)} />
        {showAfterTax && (
          <Stat label="After-tax" value={fmt(afterTax)} className="text-fg-muted" subtitle={`Pre-tax accts × (1−${Math.round(taxRate * 100)}%)`} />
        )}
        <Stat label="Assets" value={fmt(last?.assets ?? 0)} className="text-positive" />
        <Stat label="Liabilities" value={fmt(last?.liabilities ?? 0)} className="text-negative" />
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
            <XAxis dataKey="month" tickFormatter={(m) => format(parseISO(`${m}-01`), 'MMM')} stroke="rgb(var(--fg-subtle))" fontSize={11} />
            <YAxis tickFormatter={(v) => fmt(v, { showCents: false })} stroke="rgb(var(--fg-subtle))" fontSize={11} width={70} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => fmt(v)}
              labelFormatter={(m) => format(parseISO(`${m}-01`), 'MMMM yyyy')}
            />
            <Line type="monotone" dataKey="net" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="assets" stroke="rgb(var(--positive))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
            <Line type="monotone" dataKey="liabilities" stroke="rgb(var(--negative))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, className, subtitle }: { label: string; value: string; className?: string; subtitle?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/40 border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-[16px] font-semibold tabular ${className ?? ''}`}>{value}</div>
      {subtitle && <div className="text-[10px] text-fg-subtle/80 mt-0.5">{subtitle}</div>}
    </div>
  );
}
