/**
 * Edit-transaction modal (v0.7.28).
 *
 * Replaces the desktop inline-edit-row UX, which was cramped at every
 * column width — Date / Payee / Category / Memo / Outflow / Inflow all
 * trying to fit on one line was unworkable past ~3 word names. The
 * modal stacks fields vertically with breathing room, matching the
 * mobile inline form's structure.
 *
 * Mobile (compact layout) still uses the inline-edit form in
 * `TransactionRow.tsx` — the bottom-sheet style of that form already
 * works well on small viewports and avoids modal-on-modal stacking
 * when the receipt viewer / split editor opens from inside an edit.
 *
 * Mirrors the save / cancel logic from TransactionRow so the field
 * semantics are identical (date / amount / payee / category / memo
 * / flag, `__new__:` prefix for staging new payees, transfer
 * preservation, etc.).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Trash2, Hourglass, ExternalLink, Tag, Receipt as ReceiptIcon, Flag } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MoneyInput } from '../ui/MoneyInput';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { updateTransaction, deleteTransaction, setFlag, setCleared } from '../../db/repo';
import { PayeeAutocomplete } from '../Transactions/PayeeAutocomplete';
import { cn } from '../../lib/cn';
import type { Transaction, FlagColor, ClearedState } from '../../domain/types';

const FLAG_COLORS: Array<{ id: FlagColor; cls: string }> = [
  { id: 'red',    cls: 'text-flag-red' },
  { id: 'orange', cls: 'text-flag-orange' },
  { id: 'yellow', cls: 'text-flag-yellow' },
  { id: 'green',  cls: 'text-flag-green' },
  { id: 'blue',   cls: 'text-flag-blue' },
  { id: 'purple', cls: 'text-flag-purple' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  transactionId: string;
};

export function EditTransactionModal({ open, onClose, transactionId }: Props) {
  const txn = useBudget((s) => s.transactions.find((t) => t.id === transactionId));
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const openModal = useUI((s) => s.openModal);

  // Local draft mirror — same pattern as TransactionRow's inline edit.
  // Initialized from txn on every open, so reopening the modal after
  // canceling doesn't show stale field values.
  const [draft, setDraft] = useState<Transaction | null>(txn ?? null);
  useEffect(() => {
    if (open && txn) setDraft(txn);
  }, [open, txn]);

  if (!open || !txn || !draft) return null;

  const transferAccount = txn.transferAccountId ? accounts.find((a) => a.id === txn.transferAccountId) : null;

  function save() {
    if (!draft || !txn) return;
    if (draft === txn) { onClose(); return; }
    const patch: Partial<Transaction> & { payee?: string | null } = {};
    if (draft.date !== txn.date) patch.date = draft.date;
    if (draft.amount !== txn.amount) patch.amount = draft.amount;
    if (draft.memo !== txn.memo) patch.memo = draft.memo;
    if (draft.categoryId !== txn.categoryId) patch.categoryId = draft.categoryId;
    if (draft.flag !== txn.flag) patch.flag = draft.flag;
    if (draft.payeeId !== txn.payeeId) {
      const p = payees.find((pp) => pp.id === draft.payeeId);
      if (draft.payeeId && draft.payeeId.startsWith('__new__:')) {
        patch.payee = draft.payeeId.slice('__new__:'.length);
      } else {
        patch.payee = p?.name ?? null;
      }
    }
    if (Object.keys(patch).length > 0) updateTransaction(txn.id, patch);
    onClose();
  }

  function payeeNameFor(id: string | null): string {
    if (!id) return '';
    if (id.startsWith('__new__:')) return id.slice('__new__:'.length);
    return payees.find((p) => p.id === id)?.name ?? '';
  }

  function cycleFlag(cur: FlagColor | null): FlagColor | null {
    if (cur === null) return 'red';
    const idx = FLAG_COLORS.findIndex((f) => f.id === cur);
    if (idx === FLAG_COLORS.length - 1) return null;
    return FLAG_COLORS[idx + 1].id;
  }

  function nextCleared(c: ClearedState): ClearedState {
    return c === 'uncleared' ? 'cleared' : c === 'cleared' ? 'reconciled' : 'uncleared';
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <span>Edit transaction</span>
          {txn.transferAccountId && (
            <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent">
              <ArrowLeftRight size={10} /> Transfer
            </span>
          )}
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          {/* Delete on the left — visually separated from the primary
              actions to avoid mispress. Confirms before destroying. */}
          <button
            onClick={() => {
              if (confirm('Delete this transaction?')) {
                deleteTransaction(txn.id);
                onClose();
              }
            }}
            className="text-negative hover:bg-negative/15 px-3 py-2 rounded-md text-[12.5px] font-medium flex items-center gap-1.5"
          >
            <Trash2 size={13} /> Delete
          </button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save changes</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Date + Flag + Cleared on a single header row */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Date</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="w-full h-9 px-2 mt-0.5 rounded bg-surface-3 border border-border text-[13px] text-fg"
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle block">Flag</label>
            <button
              onClick={() => setDraft({ ...draft, flag: cycleFlag(draft.flag) })}
              className="h-9 w-9 mt-0.5 rounded bg-surface-3 border border-border grid place-items-center"
              title="Cycle flag color"
              aria-label="Cycle flag color"
            >
              <Flag
                size={14}
                className={cn(draft.flag ? FLAG_COLORS.find((f) => f.id === draft.flag)?.cls : 'text-fg-subtle/60')}
                fill={draft.flag ? 'currentColor' : 'none'}
              />
            </button>
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle block">Cleared</label>
            <button
              onClick={() => setCleared(txn.id, nextCleared(txn.cleared))}
              className="h-9 px-3 mt-0.5 rounded bg-surface-3 border border-border text-[12px] capitalize"
              title="Click to cycle: uncleared → cleared → reconciled"
            >
              {txn.cleared}
            </button>
          </div>
        </div>

        {/* Payee — autocomplete + view-history link. Spans full width
            because the dropdown is the most visually prominent input. */}
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Payee</label>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 min-w-0">
              <PayeeAutocomplete
                big
                value={payeeNameFor(draft.payeeId)}
                onChange={(name) => {
                  const found = payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
                  setDraft({ ...draft, payeeId: found?.id ?? `__new__:${name}` });
                }}
                onPickExisting={(id) => setDraft({ ...draft, payeeId: id })}
              />
            </div>
            {draft.payeeId && !draft.payeeId.startsWith('__new__:') && (
              <Link
                to={`/payees/${draft.payeeId}`}
                onClick={onClose}
                className="text-fg-subtle hover:text-accent flex-shrink-0 p-2 rounded hover:bg-surface-3"
                title="View transaction history with this payee"
                aria-label="View payee history"
              >
                <ExternalLink size={14} />
              </Link>
            )}
          </div>
        </div>

        {/* Category (or transfer label for transfer txns). Transfer
            txns can't change category — the transfer endpoint defines
            the relationship. */}
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Category</label>
          {txn.transferAccountId ? (
            <div className="mt-0.5 px-2 h-9 rounded bg-surface-3/40 border border-border/60 text-[12.5px] text-fg-muted flex items-center gap-1.5">
              <ArrowLeftRight size={12} />
              Transfer · {transferAccount?.name ?? '—'}
            </div>
          ) : draft.splits && draft.splits.length > 0 ? (
            <div className="mt-0.5 px-2 h-9 rounded bg-surface-3/40 border border-border/60 text-[12.5px] text-fg-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Tag size={12} /> Split across {draft.splits.length} categories
              </span>
              <button
                onClick={() => {
                  onClose();
                  openModal({ type: 'splitEditor', transactionId: txn.id });
                }}
                className="text-accent text-[11.5px] hover:underline"
              >
                Edit splits →
              </button>
            </div>
          ) : (
            <select
              value={draft.categoryId ?? ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
              className="w-full mt-0.5 h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
            >
              <option value="">— Inflow / Uncategorized —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Memo</label>
          <input
            value={draft.memo}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            placeholder="Optional note (e.g. order #, who paid)"
            className="w-full mt-0.5 h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
          />
        </div>

        {/* Outflow + inflow side by side. Same pattern the inline form
            uses — one is always 0 in normal use, but credit-card
            payments / refunds need both. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-negative">Outflow</label>
            <div className="mt-0.5">
              <MoneyInput
                value={draft.amount < 0 ? -draft.amount : 0}
                outflow
                onCommit={(v) => setDraft({ ...draft, amount: v === 0 ? 0 : -Math.abs(v) })}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-positive">Inflow</label>
            <div className="mt-0.5">
              <MoneyInput
                value={draft.amount > 0 ? draft.amount : 0}
                onCommit={(v) => setDraft({ ...draft, amount: Math.abs(v) })}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Bottom utility row — refund tag + receipt viewer + split-editor
            shortcut. Lives outside the main field stack to keep the form
            scannable. */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <button
            type="button"
            onClick={() => openModal({ type: 'expectedRefund', transactionId: txn.id })}
            className="text-[11.5px] text-accent hover:underline flex items-center gap-1"
          >
            <Hourglass size={12} /> {txn.expectedRefund ? 'Edit refund expectation' : 'Tag expected refund'}
          </button>
          {!txn.transferAccountId && (!draft.splits || draft.splits.length === 0) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                openModal({ type: 'splitEditor', transactionId: txn.id });
              }}
              className="text-[11.5px] text-accent hover:underline flex items-center gap-1"
            >
              <Tag size={12} /> Split across categories…
            </button>
          )}
          {txn.receiptImageDataUrl && (
            <span className="text-[11.5px] text-fg-subtle flex items-center gap-1 ml-auto">
              <ReceiptIcon size={12} /> Receipt attached
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
