import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { HelpHint } from '../ui/HelpHint';
import { useBudget } from '../../store/budget';
import { reconcileAccount } from '../../db/repo';
import { computeAccountBalances } from '../../domain/budget';
import { useFormatMoney } from '../../lib/format';
import { parseAmountToCents } from '../../domain/calc';

export function ReconcileModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const account = accounts.find((a) => a.id === accountId);
  const fmt = useFormatMoney();
  const [target, setTarget] = useState('');

  if (!account) return null;
  const a = computeAccountBalances([account], txns)[0];

  function run() {
    const v = parseAmountToCents(target);
    if (v === null) return;
    const { adjustment } = reconcileAccount(accountId, v);
    onClose();
    setTimeout(() => {
      if (adjustment !== 0) alert(`Reconciled. Adjustment of ${fmt(adjustment)} recorded.`);
    }, 50);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reconcile ${account.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={run} disabled={!target.trim()}>Reconcile</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-[12.5px] text-fg-muted flex items-start gap-1.5">
          <span>
            Enter the balance shown by your bank or service. We'll mark all currently-cleared
            transactions as reconciled and add an adjustment if needed.
          </span>
          <HelpHint title="Reconciling">
            A way to make sure Monii Watch matches reality. Look up your
            real balance at the bank's website or app, type it in here,
            and we'll lock down all the matching transactions and (if
            needed) record a small adjustment for any drift.
          </HelpHint>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Current cleared" value={fmt(a.clearedBalance)} />
          <Stat label="Working balance" value={fmt(a.balance)} />
        </div>
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            Bank balance today
            <HelpHint title="Bank Balance Today">
              The exact amount your bank shows as your current balance
              right now. Not your "available" balance (which can lag
              pending charges). Look for the actual balance on your
              statement or app dashboard.
            </HelpHint>
          </label>
          <Input
            autoFocus
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full mt-1 text-right tabular"
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          />
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/40 border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="text-[14px] font-semibold tabular">{value}</div>
    </div>
  );
}
