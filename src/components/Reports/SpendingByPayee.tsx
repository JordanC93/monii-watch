/**
 * Top-vendors-by-spend report. Aggregates per payee over the
 * selected month window, sorts by total outflow, shows count +
 * average + last-seen-date.
 */

import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { computePayeeSpend } from '../../domain/payeeSpend';
import { useFormatMoney } from '../../lib/format';
import { format, parseISO } from 'date-fns';

export function SpendingByPayee({ months = 3, limit = 25 }: { months?: number; limit?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();

  const rows = useMemo(() => {
    const d = new Date();
    const thisMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return computePayeeSpend(accounts, txns, payees, months, thisMonth).slice(0, limit);
  }, [accounts, txns, payees, months, limit]);

  if (rows.length === 0) {
    return <div className="text-[12.5px] text-fg-subtle text-center py-6">No payee activity in the past {months} months yet.</div>;
  }

  const max = rows[0]?.totalSpent ?? 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-wider text-fg-subtle">
          <tr className="border-b border-border">
            <th className="text-left py-1.5 pr-2">Payee</th>
            <th className="text-right py-1.5 px-2">Spent</th>
            <th className="text-right py-1.5 px-2 hidden sm:table-cell">Txns</th>
            <th className="text-right py-1.5 px-2 hidden sm:table-cell">Avg / txn</th>
            <th className="text-right py-1.5 pl-2 hidden md:table-cell">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = (r.totalSpent / max) * 100;
            return (
              <tr key={r.payeeId} className="border-b border-border/40 relative">
                <td className="py-1.5 pr-2 truncate relative">
                  {/* Subtle bar showing relative spend share */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-accent/10"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative">{r.payeeName}</span>
                </td>
                <td className="text-right py-1.5 px-2 tabular font-medium">{fmt(r.totalSpent)}</td>
                <td className="text-right py-1.5 px-2 tabular text-fg-muted hidden sm:table-cell">{r.txnCount}</td>
                <td className="text-right py-1.5 px-2 tabular text-fg-muted hidden sm:table-cell">{fmt(r.avgOutflow)}</td>
                <td className="text-right py-1.5 pl-2 tabular text-fg-subtle hidden md:table-cell">
                  {r.lastTxnDate ? format(parseISO(r.lastTxnDate), 'MMM d') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
