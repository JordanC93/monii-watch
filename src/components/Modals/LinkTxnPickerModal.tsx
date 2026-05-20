/**
 * Link-transaction picker (v0.7.29).
 *
 * Opens from the EditTransactionModal "Link to…" button. Shows the
 * user's recent transactions with a search box; clicking a row links
 * the two transactions together. The link is symmetrical — both sides
 * pointed at each other — so when the user later opens either one,
 * Monii surfaces the partner.
 *
 * Use cases the link covers:
 *   - Refund linked to original purchase
 *   - Card-statement payment linked to bank-side debit (avoids
 *     double-counting after both statements are imported)
 *   - Two halves of an ad-hoc split between people
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { useBudget } from '../../store/budget';
import { linkTransactions } from '../../db/repo';
import { useFormatDate } from '../../lib/format';
import { Search, Link as LinkIcon } from 'lucide-react';
import { toast } from '../../lib/toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The transaction we're linking FROM — picker filters this out so a
   *  user can't accidentally link a transaction to itself. */
  fromTxnId: string;
};

export function LinkTxnPickerModal({ open, onClose, fromTxnId }: Props) {
  const formatDate = useFormatDate();
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const payees = useBudget((s) => s.payees);
  const [filter, setFilter] = useState('');

  const matches = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const sorted = [...txns]
      .filter((t) => t.id !== fromTxnId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!term) return sorted.slice(0, 50);
    return sorted.filter((t) => {
      const p = payees.find((pp) => pp.id === t.payeeId);
      const hay = `${p?.name ?? ''} ${t.memo} ${t.date}`.toLowerCase();
      return hay.includes(term);
    }).slice(0, 100);
  }, [filter, txns, payees, fromTxnId]);

  function pick(targetId: string) {
    linkTransactions(fromTxnId, targetId);
    toast.success('Linked.');
    onClose();
  }

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <LinkIcon size={14} /> Link this transaction to…
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-fg-subtle" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by payee, memo, or date…"
            className="flex-1"
            autoFocus
          />
        </div>
        <div className="text-[11px] text-fg-subtle">
          Pick the transaction to link. Linking is bidirectional — both rows will show the link from then on.
        </div>
        <div className="border border-border rounded-md overflow-hidden">
          {matches.length === 0 ? (
            <div className="text-[12.5px] text-fg-subtle text-center py-6">
              {filter ? 'No transactions match.' : 'No other transactions yet.'}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {matches.map((t) => {
                const p = payees.find((pp) => pp.id === t.payeeId);
                const a = accounts.find((aa) => aa.id === t.accountId);
                return (
                  <button
                    key={t.id}
                    onClick={() => pick(t.id)}
                    className="w-full grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 text-left text-[12.5px] hover:bg-surface-2/40"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p?.name ?? <span className="text-fg-subtle italic">No payee</span>}</div>
                      <div className="text-[10.5px] text-fg-subtle truncate">
                        {a?.name ?? '—'} · {formatDate(t.date)}
                        {t.memo && <> · {t.memo}</>}
                      </div>
                    </div>
                    <Money cents={t.amount} className="text-[12.5px] tabular" monochrome />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
