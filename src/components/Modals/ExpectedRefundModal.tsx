/**
 * Expected Refund modal.
 *
 * Tags a transaction with the amount + date the user expects to be refunded.
 * The Reports page surfaces unfulfilled refunds whose `expectedBy` has
 * passed; the chat panel can answer "what refunds am I waiting on".
 *
 * The original transaction is preserved as-is — the refund (when it
 * arrives) lands as a separate inflow transaction. This row just carries
 * the expectation metadata.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MoneyInput } from '../ui/MoneyInput';
import { useBudget } from '../../store/budget';
import { setExpectedRefund, markRefundReceived } from '../../db/repo';
import { todayIso, isoAddDays } from '../../domain/date';
import { useFormatMoney } from '../../lib/format';
import { CheckCircle2, Trash2 } from 'lucide-react';

type Props = { open: boolean; onClose: () => void; transactionId: string };

export function ExpectedRefundModal({ open, onClose, transactionId }: Props) {
  const txn = useBudget((s) => s.transactions.find((t) => t.id === transactionId));
  const fmt = useFormatMoney();
  const initial = txn?.expectedRefund;

  // Default to the absolute amount of the txn — most refunds equal the original
  // outflow. User can override.
  const fallbackAmount = txn ? Math.abs(txn.amount) : 0;
  const [amount, setAmount] = useState<number>(initial?.amount ?? fallbackAmount);
  const [expectedBy, setExpectedBy] = useState<string>(initial?.expectedBy ?? isoAddDays(todayIso(), 14));

  if (!txn) return null;

  function save() {
    if (amount <= 0) return;
    setExpectedRefund(transactionId, { amount, expectedBy, received: initial?.received ?? false });
    onClose();
  }
  function clear() {
    setExpectedRefund(transactionId, null);
    onClose();
  }
  function markReceived() {
    markRefundReceived(transactionId, true);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Expecting a refund?"
      size="md"
      footer={
        <div className="flex justify-between gap-2">
          {initial && (
            <Button variant="danger" size="sm" onClick={clear}>
              <Trash2 size={13} /> Clear
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-fg-muted">
          We&apos;ll surface this on the Pending Refunds report card if it isn&apos;t marked
          received by the date you set.
        </p>
        <div>
          <label className="block text-[12px] font-medium mb-1" id="refund-amount-label">Refund amount</label>
          <div aria-labelledby="refund-amount-label">
            <MoneyInput value={amount} onCommit={setAmount} className="w-full" autoFocus />
          </div>
          <div className="text-[11px] text-fg-subtle mt-1">
            Original transaction: {fmt(txn.amount)}
          </div>
        </div>
        <div>
          <label htmlFor="refund-expected-by" className="block text-[12px] font-medium mb-1">Expected by</label>
          <input
            id="refund-expected-by"
            type="date"
            value={expectedBy}
            onChange={(e) => setExpectedBy(e.target.value)}
            className="w-full h-9 px-2 rounded bg-surface-3 border border-border text-[13px]"
          />
        </div>
        {initial && !initial.received && (
          <button
            onClick={markReceived}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-positive/15 text-positive font-medium text-[13px] hover:bg-positive/25"
          >
            <CheckCircle2 size={15} /> Mark refund received
          </button>
        )}
        {initial?.received && (
          <div className="flex items-center gap-1.5 text-positive text-[12px]">
            <CheckCircle2 size={13} /> Refund received
          </div>
        )}
      </div>
    </Modal>
  );
}
