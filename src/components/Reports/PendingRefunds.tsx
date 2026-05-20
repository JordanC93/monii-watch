/**
 * Pending refunds report card.
 *
 * Lists every transaction tagged with an `expectedRefund` that hasn't been
 * marked received. Highlights overdue rows (`expectedBy < today`).
 *
 * The card hides itself when there are zero pending refunds — never noisy.
 */

import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { useFormatMoney, useFormatDateShort } from '../../lib/format';
import { todayIso } from '../../domain/date';
import { useUI } from '../../store/ui';
import { CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react';
import { markRefundReceived } from '../../db/repo';

export function PendingRefunds() {
  const formatDateShort = useFormatDateShort();
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const accounts = useBudget((s) => s.accounts);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const pending = useMemo(() => {
    return txns
      .filter((t) => t.expectedRefund && !t.expectedRefund.received)
      .sort((a, b) => (a.expectedRefund!.expectedBy < b.expectedRefund!.expectedBy ? -1 : 1));
  }, [txns]);

  if (pending.length === 0) return null;

  const today = todayIso();
  const totalExpected = pending.reduce((s, t) => s + (t.expectedRefund?.amount ?? 0), 0);
  const overdueCount = pending.filter((t) => t.expectedRefund!.expectedBy < today).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-2 text-fg-muted">
          <Hourglass size={13} className="text-accent" />
          <span>{pending.length} pending · {fmt(totalExpected)} total expected</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1 text-warning">
            <AlertTriangle size={12} /> {overdueCount} overdue
          </div>
        )}
      </div>
      <div className="divide-y divide-border/60 border border-border rounded-lg overflow-hidden">
        {pending.map((t) => {
          const overdue = t.expectedRefund!.expectedBy < today;
          const payee = payees.find((p) => p.id === t.payeeId);
          const account = accounts.find((a) => a.id === t.accountId);
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-surface-2/40"
            >
              <button
                className="text-left flex-1 min-w-0"
                onClick={() => openModal({ type: 'expectedRefund', transactionId: t.id })}
              >
                <div className="font-medium truncate">{payee?.name ?? 'No payee'}</div>
                <div className="text-[11px] text-fg-subtle truncate">
                  {account?.name} · {formatDateShort(t.date)}
                  {t.memo && <> · {t.memo}</>}
                </div>
              </button>
              <div className="text-right flex-shrink-0">
                <div className="tabular font-semibold">{fmt(t.expectedRefund!.amount)}</div>
                <div className={`text-[11px] tabular ${overdue ? 'text-warning' : 'text-fg-subtle'}`}>
                  {overdue ? 'overdue · ' : 'by '}{formatDateShort(t.expectedRefund!.expectedBy)}
                </div>
              </div>
              <button
                onClick={() => markRefundReceived(t.id, true)}
                className="text-positive hover:bg-positive/15 p-1.5 rounded flex-shrink-0"
                aria-label="Mark refund received"
                title="Mark received"
              >
                <CheckCircle2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
