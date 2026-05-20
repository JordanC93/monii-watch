/**
 * Right-side detail pane for transactions (Tier 4 #1 / Tier 5 #2 seed).
 *
 * On regular layouts, when a row is "opened" via a single click, this
 * pane slides in from the right showing: full transaction data,
 * related transactions (same payee, same category), and bulk-edit
 * affordances. Mail.app / Notion vibe — list stays in context.
 *
 * On compact layouts, fall back to the existing inline-edit modal.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBudget } from '../../store/budget';
import { useFormatMoney, useFormatDate } from '../../lib/format';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { setCleared, setFlag, deleteTransaction, updateTransaction } from '../../db/repo';
import { TagInput } from './TagInput';
import { PayeeAutocomplete } from './PayeeAutocomplete';
import { useUI } from '../../store/ui';
import { Money } from '../ui/Money';
import { X, Trash2, ArrowLeftRight, Receipt as ReceiptIcon, Hourglass, Tag, ExternalLink, Pencil, Check as CheckIcon } from 'lucide-react';
import { ReceiptViewer } from './ReceiptViewer';

type Props = { transactionId: string; onClose: () => void };

export function TxnDetailPane({ transactionId, onClose }: Props) {
  const formatDate = useFormatDate();
  const txn = useBudget((s) => s.transactions.find((t) => t.id === transactionId));
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const allTxns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const openModal = useUI((s) => s.openModal);
  const [showReceipt, setShowReceipt] = useState(false);
  // v0.7.28 — inline payee edit. Click pencil to swap the read-only
  // Link to a PayeeAutocomplete; commit on selection or save button.
  // Doesn't disturb the rest of the pane (other fields stay read-only).
  const [editingPayee, setEditingPayee] = useState(false);
  const [payeeDraft, setPayeeDraft] = useState('');

  const related = useMemo(() => {
    if (!txn) return [] as typeof allTxns;
    return allTxns.filter((t) =>
      t.id !== txn.id && (t.payeeId === txn.payeeId || t.categoryId === txn.categoryId),
    ).slice(0, 12);
  }, [allTxns, txn]);

  if (!txn) return null;
  const account = accounts.find((a) => a.id === txn.accountId);
  const payee = payees.find((p) => p.id === txn.payeeId);
  const category = categories.find((c) => c.id === txn.categoryId);
  const isOnBudget = account ? ACCOUNT_TYPE_META[account.type].onBudget : true;

  return (
    <aside
      data-zen-hide
      className="hidden lg:flex flex-col w-[360px] flex-shrink-0 border-l border-border bg-surface text-[13px] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-[12px] font-semibold text-fg-muted">Transaction</div>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg p-1 rounded" aria-label="Close detail">
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <div className="text-[11px] text-fg-subtle uppercase tracking-wider">Amount</div>
          <Money cents={txn.amount} className="text-[22px] font-semibold tabular" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" value={formatDate(txn.date)} />
          <Field label="Account" value={account?.name ?? '—'} subtle={!isOnBudget ? 'tracking' : undefined} />

          {/* v0.7.28 — Payee field: read-only by default with a Link to
              the per-payee history page + a pencil to flip into inline
              edit mode (autocomplete dropdown). Spans both columns
              when editing so the dropdown has room. */}
          <div className={editingPayee ? 'col-span-2' : ''}>
            <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-0.5">Payee</div>
            {editingPayee ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <PayeeAutocomplete
                    big
                    autoFocus
                    value={payeeDraft}
                    onChange={(name) => setPayeeDraft(name)}
                    onPickExisting={(id, name) => {
                      // Persist immediately on pick — saves the user
                      // an extra confirmation tap.
                      updateTransaction(txn.id, { payeeId: id });
                      setPayeeDraft(name);
                      setEditingPayee(false);
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    // Commit free-text: resolve to existing if name
                    // matches case-insensitively; otherwise stage as a
                    // new payee. Mirrors the row-edit save flow.
                    const trimmed = payeeDraft.trim();
                    if (!trimmed) {
                      updateTransaction(txn.id, { payeeId: null });
                    } else {
                      const existing = payees.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
                      if (existing) updateTransaction(txn.id, { payeeId: existing.id });
                      else updateTransaction(txn.id, { payee: trimmed });
                    }
                    setEditingPayee(false);
                  }}
                  className="text-accent hover:bg-accent/15 p-2 rounded flex-shrink-0"
                  title="Save"
                  aria-label="Save payee"
                >
                  <CheckIcon size={14} />
                </button>
                <button
                  onClick={() => setEditingPayee(false)}
                  className="text-fg-subtle hover:text-fg p-2 rounded flex-shrink-0"
                  title="Cancel"
                  aria-label="Cancel payee edit"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="text-[12.5px] flex items-center gap-1.5 min-w-0">
                {payee ? (
                  <>
                    <Link
                      to={`/payees/${payee.id}`}
                      className="truncate hover:text-accent hover:underline flex items-center gap-1"
                      title={`View transaction history with ${payee.name}`}
                    >
                      {payee.name}
                      <ExternalLink size={10} className="text-fg-subtle flex-shrink-0" />
                    </Link>
                  </>
                ) : (
                  <span className="text-fg-subtle italic">No payee</span>
                )}
                <button
                  onClick={() => {
                    setPayeeDraft(payee?.name ?? '');
                    setEditingPayee(true);
                  }}
                  className="ml-auto text-fg-subtle hover:text-accent p-1 rounded"
                  title="Fix wrong payee"
                  aria-label="Edit payee"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
          </div>

          <Field
            label="Category"
            value={txn.transferAccountId ? `Transfer · ${accounts.find((a) => a.id === txn.transferAccountId)?.name ?? '—'}` : (category?.name ?? 'Uncategorized')}
            icon={txn.transferAccountId ? <ArrowLeftRight size={11} /> : <Tag size={11} />}
          />
          <Field label="Cleared" value={cap(txn.cleared)} />
          <Field label="Flag" value={txn.flag ? cap(txn.flag) : '—'} />
        </div>

        {txn.memo && (
          <div className="bg-surface-2/40 rounded-lg p-2 text-[12px] text-fg-muted">
            <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-0.5">Memo</div>
            {txn.memo}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            className="text-[11.5px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3"
            onClick={() => setCleared(txn.id, txn.cleared === 'cleared' ? 'uncleared' : 'cleared')}
          >Toggle cleared</button>
          <button
            className="text-[11.5px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3"
            onClick={() => setFlag(txn.id, txn.flag ? null : 'red')}
          >{txn.flag ? 'Clear flag' : 'Flag'}</button>
          <button
            className="text-[11.5px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 flex items-center gap-1"
            onClick={() => openModal({ type: 'expectedRefund', transactionId: txn.id })}
          ><Hourglass size={11} /> Refund?</button>
          {txn.receiptImageDataUrl && (
            <button
              className="text-[11.5px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 flex items-center gap-1"
              onClick={() => setShowReceipt(true)}
              aria-label="View receipt"
            ><ReceiptIcon size={11} aria-hidden="true" /> Receipt</button>
          )}
          <button
            className="text-[11.5px] px-2 py-1 rounded bg-negative/15 text-negative hover:bg-negative/25 ml-auto flex items-center gap-1"
            onClick={() => { if (confirm('Delete this transaction?')) { deleteTransaction(txn.id); onClose(); } }}
          ><Trash2 size={11} /> Delete</button>
        </div>
      </div>

      {showReceipt && txn.receiptImageDataUrl && (
        <ReceiptViewer
          txnId={txn.id}
          imageDataUrl={txn.receiptImageDataUrl}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {/* Tags — Tier 14 #3. Free-form labels orthogonal to categories.
          Common patterns: "vacation", "tax-deductible", "client-billable". */}
      <div className="border-t border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1">
          <Tag size={11} /> Tags
        </div>
        <TagInput
          value={txn.tags ?? []}
          onChange={(next) => updateTransaction(txn.id, { tags: next.length > 0 ? next : undefined })}
        />
        <div className="text-[10.5px] text-fg-subtle mt-1">
          Cross-cutting labels, orthogonal to categories. Filter by tag on Search + Reports.
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">
          Related ({related.length})
        </div>
        {related.length === 0 ? (
          <div className="text-[11.5px] text-fg-subtle">No related transactions.</div>
        ) : (
          <div className="space-y-1">
            {related.map((t) => {
              const p = payees.find((pp) => pp.id === t.payeeId);
              return (
                <div key={t.id} className="flex items-center gap-2 text-[12px] py-1 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    {p ? (
                      <Link
                        to={`/payees/${p.id}`}
                        className="truncate hover:text-accent hover:underline block"
                        title={`View history with ${p.name}`}
                      >
                        {p.name}
                      </Link>
                    ) : (
                      <div className="truncate text-fg-subtle italic">No payee</div>
                    )}
                    <div className="text-[10.5px] text-fg-subtle tabular">{formatDate(t.date)}</div>
                  </div>
                  <Money cents={t.amount} className="tabular" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function Field({ label, value, subtle, icon }: { label: string; value: string; subtle?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="text-[12.5px] truncate flex items-center gap-1">
        {icon}
        {value}
        {subtle && <span className="text-fg-subtle text-[10.5px]">({subtle})</span>}
      </div>
    </div>
  );
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
