import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { HelpHint } from '../ui/HelpHint';
import { useBudget } from '../../store/budget';
import { moveAssignment } from '../../db/repo';
import { computeMonthBudget } from '../../domain/budget';
import { useFormatMoney } from '../../lib/format';
import { parseAmountToCents } from '../../domain/calc';

export function MoveMoneyModal({ open, onClose, fromCategoryId, month, toCategoryId }: {
  open: boolean; onClose: () => void; fromCategoryId: string; month: string;
  /** Optional pre-fill for the destination category — used by the
   *  drag-to-move flow on BudgetTable so the user doesn't have to
   *  re-select the row they just dropped on. */
  toCategoryId?: string;
}) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const assignments = useBudget((s) => s.assignments);
  const fmt = useFormatMoney();

  const fromCat = categories.find((c) => c.id === fromCategoryId);
  const [toId, setToId] = useState<string>(
    toCategoryId
      ?? categories.find((c) => c.id !== fromCategoryId)?.id
      ?? ''
  );
  const [amount, setAmount] = useState('');

  if (!fromCat) return null;
  const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, month);
  const fromAvail = monthBudget.get(fromCategoryId)?.available ?? 0;

  function run() {
    const cents = parseAmountToCents(amount);
    if (cents === null || cents <= 0 || !toId) return;
    moveAssignment(month, fromCategoryId, toId, cents);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move Money"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={run} disabled={!amount.trim() || !toId}>Move</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-[13px] flex items-center gap-1.5">
          <span>
            Move money from <span className="font-semibold">{fromCat.name}</span> ({fmt(fromAvail)} available)
          </span>
          <HelpHint title="Move Money">
            Reassigns money you'd already given to one envelope into a
            different envelope in the same month. Doesn't move any real
            cash between bank accounts. Use it when you over-funded one
            category and need to cover another.
          </HelpHint>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            To category
            <HelpHint title="To Category">
              The envelope that will receive the money. Its Available
              amount goes up by the same amount you take from the source.
            </HelpHint>
          </label>
          <Select value={toId} onChange={(e) => setToId(e.target.value)} className="mt-1">
            {categories.filter((c) => c.id !== fromCategoryId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted">Amount</label>
          <Input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full mt-1 text-right tabular"
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          />
        </div>
      </div>
    </Modal>
  );
}
