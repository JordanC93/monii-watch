import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { updateTransaction } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { parseAmountToCents } from '../../domain/calc';
import { newId } from '../../domain/id';
import { Plus, Trash2 } from 'lucide-react';
import type { Split } from '../../domain/types';

export function SplitEditorModal({ open, onClose, transactionId }: { open: boolean; onClose: () => void; transactionId: string }) {
  const txn = useBudget((s) => s.transactions.find((t) => t.id === transactionId));
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const [splits, setSplits] = useState<Split[]>(
    txn && txn.splits.length > 0
      ? txn.splits
      : [{ id: newId(), categoryId: txn?.categoryId ?? null, amount: txn?.amount ?? 0, memo: '' }],
  );
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((txn?.splits ?? splits).map((s) => [s.id, dollars(s.amount)])),
  );

  if (!txn) return null;

  const total = splits.reduce((acc, s) => acc + s.amount, 0);
  const remaining = txn.amount - total;

  function update(idx: number, patch: Partial<Split>) {
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addRow() {
    const id = newId();
    setSplits([...splits, { id, categoryId: null, amount: 0, memo: '' }]);
    setDraftAmounts((d) => ({ ...d, [id]: '' }));
  }
  function removeRow(idx: number) {
    setSplits(splits.filter((_, i) => i !== idx));
  }

  function save() {
    if (Math.abs(remaining) > 0) {
      // auto-balance into the last split
      const adjusted = [...splits];
      adjusted[adjusted.length - 1] = { ...adjusted[adjusted.length - 1], amount: adjusted[adjusted.length - 1].amount + remaining };
      updateTransaction(transactionId, { splits: adjusted, categoryId: null });
    } else {
      updateTransaction(transactionId, { splits, categoryId: null });
    }
    onClose();
  }

  function clearSplits() {
    updateTransaction(transactionId, { splits: [], categoryId: txn!.categoryId });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Split transaction"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12.5px]">
            Total <span className="font-semibold tabular">{fmt(total)}</span> /
            target <span className="font-semibold tabular">{fmt(txn.amount)}</span>
            {' · '}
            Remaining <span className={`font-semibold tabular ${Math.abs(remaining) > 0 ? 'text-warning' : 'text-positive'}`}>{fmt(remaining)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={clearSplits}>Clear splits</Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        {splits.map((s, i) => (
          <div key={s.id} className="grid grid-cols-[1fr_1fr_120px_28px] gap-2 items-center">
            <Select
              value={s.categoryId ?? ''}
              onChange={(e) => update(i, { categoryId: e.target.value || null })}
            >
              <option value="">— Category —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input
              value={s.memo}
              onChange={(e) => update(i, { memo: e.target.value })}
              placeholder="Memo"
            />
            <Input
              value={draftAmounts[s.id] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraftAmounts((d) => ({ ...d, [s.id]: v }));
                const cents = parseAmountToCents(v);
                if (cents !== null) update(i, { amount: cents });
              }}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right tabular"
            />
            <button
              onClick={() => removeRow(i)}
              className="text-fg-subtle hover:text-negative p-1 rounded justify-self-center"
              aria-label="Remove split"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={addRow}><Plus size={13} /> Add split</Button>
      </div>
    </Modal>
  );
}

function dollars(cents: number): string {
  return (cents / 100).toString();
}
