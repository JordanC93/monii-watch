/**
 * IOU ledger report card.
 *
 * Lists every entry in `Settings.iouLedger` with running balance per
 * person. Positive = they owe you, negative = you owe them. The total
 * is shown at the top.
 *
 * The user adds/edits entries via the IouEntryModal. Tagging a txn
 * "split with X 50/50" (future addition) updates `adjustIou(name,delta)`.
 */

import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { useUI } from '../../store/ui';
import { Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export function IouLedger() {
  const ledger = useBudget((s) => s.settings.iouLedger);
  const fmt = useFormatMoney();
  const openModal = useUI((s) => s.openModal);

  const total = ledger.reduce((s, e) => s + e.balance, 0);
  const owed = ledger.filter((e) => e.balance > 0);
  const owing = ledger.filter((e) => e.balance < 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px]">
        <div className="text-fg-muted">
          {ledger.length === 0 ? 'No entries yet' : (
            <>
              <span className="text-positive font-semibold">{fmt(owed.reduce((s, e) => s + e.balance, 0))}</span>
              <span className="text-fg-subtle"> owed to you</span>
              <span className="mx-1.5 text-fg-subtle">·</span>
              <span className="text-negative font-semibold">{fmt(-owing.reduce((s, e) => s + e.balance, 0))}</span>
              <span className="text-fg-subtle"> you owe</span>
            </>
          )}
        </div>
        <button
          onClick={() => openModal({ type: 'iouEntry' })}
          className="flex items-center gap-1 text-[11.5px] text-accent hover:underline font-medium"
        >
          <Plus size={12} /> Add IOU
        </button>
      </div>

      {ledger.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
          {ledger.map((e) => {
            const positive = e.balance > 0;
            return (
              <button
                key={e.id}
                onClick={() => openModal({ type: 'iouEntry', entryId: e.id })}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2/40 text-left"
              >
                <div className={`w-7 h-7 rounded-full grid place-items-center flex-shrink-0 ${positive ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative'}`}>
                  {positive ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{e.personName}</div>
                  {e.notes && <div className="text-[11px] text-fg-subtle truncate">{e.notes}</div>}
                </div>
                <div className={`tabular text-[13px] font-semibold flex-shrink-0 ${positive ? 'text-positive' : 'text-negative'}`}>
                  {positive ? '+' : ''}{fmt(e.balance)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {ledger.length > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-2 text-[12.5px]">
          <span className="font-semibold">Net</span>
          <span className={`tabular font-semibold ${total >= 0 ? 'text-positive' : 'text-negative'}`}>
            {total >= 0 ? '+' : ''}{fmt(total)}
          </span>
        </div>
      )}
    </div>
  );
}
