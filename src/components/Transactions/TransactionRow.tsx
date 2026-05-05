import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Trash2, ArrowLeftRight, Check, Circle, Paperclip, Hourglass, ExternalLink, Pencil } from 'lucide-react';
import { ReceiptViewer } from './ReceiptViewer';
import { TxnContextMenu } from './TxnContextMenu';
import { TxnActionSheet } from './TxnActionSheet';
import { PayeeAutocomplete } from './PayeeAutocomplete';
import { useLongPress } from '../../lib/longPress';
import type { Transaction, FlagColor, ClearedState } from '../../domain/types';
import { useBudget } from '../../store/budget';
import { Money } from '../ui/Money';
import { MoneyInput } from '../ui/MoneyInput';
import { cn } from '../../lib/cn';
import { updateTransaction, deleteTransaction, setCleared, setFlag } from '../../db/repo';
import { formatDateShort } from '../../domain/date';
import { useUI } from '../../store/ui';
import { useEffectiveLayout } from '../../lib/layout';

type Props = {
  txn: Transaction;
  showAccount?: boolean;
  /**
   * Tier 12 #8 — running account balance after this transaction. Only
   * meaningful in single-account views (the parent table only computes
   * it when `accountId` is set). Undefined = don't render the column.
   */
  runningBalance?: number;
};

const FLAG_COLORS: Array<{ id: FlagColor; cls: string }> = [
  { id: 'red',    cls: 'text-flag-red' },
  { id: 'orange', cls: 'text-flag-orange' },
  { id: 'yellow', cls: 'text-flag-yellow' },
  { id: 'green',  cls: 'text-flag-green' },
  { id: 'blue',   cls: 'text-flag-blue' },
  { id: 'purple', cls: 'text-flag-purple' },
];

/**
 * Transaction row.
 *
 *  - md+:  inline grid with editable cells. Double-click to edit.
 *  - <md:  card layout: payee top-left, amount right; category + memo on a
 *          second line. Tap the row to open in edit mode.
 */
export function TransactionRow({ txn, showAccount, runningBalance }: Props) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const openModal = useUI((s) => s.openModal);
  const selected = useUI((s) => s.selectedTxnIds.has(txn.id));
  const toggleSelected = useUI((s) => s.toggleTxnSelected);
  const setDetailTxnId = useUI((s) => s.setDetailTxnId);
  const detailTxnId = useUI((s) => s.detailTxnId);
  const expandedTxnId = useUI((s) => s.expandedTxnId);
  const setExpandedTxnId = useUI((s) => s.setExpandedTxnId);
  const isExpanded = expandedTxnId === txn.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn);
  // v0.7.28 — on regular (desktop / wide) layouts, clicks open the
  // EditTransactionModal instead of switching the row into the cramped
  // inline-edit grid. Compact (mobile / narrow) layouts keep the
  // inline-form behavior — bottom-sheet style works well there and
  // avoids modal-on-modal stacking when the receipt viewer or split
  // editor opens from inside an edit. `openEdit()` below picks the
  // right path based on the live layout (resize-aware via the hook).
  const layout = useEffectiveLayout();
  const useModalForEdit = layout === 'regular';
  function openEdit() {
    if (useModalForEdit) {
      openModal({ type: 'editTransaction', transactionId: txn.id });
    } else {
      setEditing(true);
    }
  }
  const [showReceipt, setShowReceipt] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Tier 12 #4 — long-press on the mobile row opens an action sheet.
  // Desktop right-click already had its own menu; this is the touch
  // equivalent.
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const longPress = useLongPress(() => setActionSheetOpen(true), 500);

  useEffect(() => { if (!editing) setDraft(txn); }, [txn, editing]);

  const payee = payees.find((p) => p.id === txn.payeeId);
  const category = categories.find((c) => c.id === txn.categoryId);
  const account = accounts.find((a) => a.id === txn.accountId);
  const transferAccount = txn.transferAccountId ? accounts.find((a) => a.id === txn.transferAccountId) : null;

  function save() {
    if (draft === txn) { setEditing(false); return; }
    const patch: Partial<Transaction> & { payee?: string | null } = {};
    if (draft.date !== txn.date) patch.date = draft.date;
    if (draft.amount !== txn.amount) patch.amount = draft.amount;
    if (draft.memo !== txn.memo) patch.memo = draft.memo;
    if (draft.categoryId !== txn.categoryId) patch.categoryId = draft.categoryId;
    if (draft.payeeId !== txn.payeeId) {
      const p = payees.find((p) => p.id === draft.payeeId);
      if (draft.payeeId && draft.payeeId.startsWith('__new__:')) {
        patch.payee = draft.payeeId.slice('__new__:'.length);
      } else {
        patch.payee = p?.name ?? null;
      }
    }
    if (Object.keys(patch).length > 0) updateTransaction(txn.id, patch);
    setEditing(false);
  }
  function cancel() { setDraft(txn); setEditing(false); }

  const inflow = txn.amount > 0 ? txn.amount : 0;
  const outflow = txn.amount < 0 ? -txn.amount : 0;

  function handleNativeCtx(id: string) {
    switch (id) {
      case 'cleared': setCleared(txn.id, txn.cleared === 'cleared' ? 'uncleared' : 'cleared'); break;
      case 'flag': setFlag(txn.id, txn.flag ? null : 'red'); break;
      case 'refund': openModal({ type: 'expectedRefund', transactionId: txn.id }); break;
      case 'similar': {
        const p = payees.find((pp) => pp.id === txn.payeeId);
        if (p) window.location.href = `/search?payee=${encodeURIComponent(p.name)}`;
        break;
      }
      case 'delete':
        if (confirm('Delete this transaction?')) deleteTransaction(txn.id);
        break;
    }
  }

  // -------- Edit mode (responsive) --------
  if (editing) {
    return (
      <div className="bg-surface-2/60 border-b border-border">
        {/* Desktop edit row */}
        <div className="hidden md:grid grid-cols-[24px_28px_92px_1fr_1fr_1fr_110px_110px_84px] items-center gap-1 px-2 py-1.5">
          <span />
          <FlagButton flag={draft.flag} onCycle={(f) => setDraft({ ...draft, flag: f })} />
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
          />
          {/* Wrapper provides relative positioning for the autocomplete
              dropdown + lets us tuck a "view payee history" link into
              the cell when the current value matches an existing payee. */}
          <div className="relative flex items-center gap-1 min-w-0">
            <div className="flex-1 min-w-0">
              <PayeeAutocomplete
                value={payeeName(draft.payeeId, payees)}
                onChange={(name) => {
                  const found = payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
                  setDraft({ ...draft, payeeId: found?.id ?? `__new__:${name}` });
                }}
                onPickExisting={(id) => setDraft({ ...draft, payeeId: id })}
              />
            </div>
            {/* "View payee history" affordance — only shown when the
                current value resolves to an existing payee (not a
                "__new__:" placeholder). Saves a tap vs going to
                Payees → click. Stops the row click so navigation
                doesn't trigger the row's own handler. */}
            {draft.payeeId && !draft.payeeId.startsWith('__new__:') && (
              <Link
                to={`/payees/${draft.payeeId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-fg-subtle hover:text-accent flex-shrink-0"
                title="View transaction history with this payee"
                aria-label="View payee history"
              >
                <ExternalLink size={12} />
              </Link>
            )}
          </div>
          {txn.transferAccountId ? (
            <div className="text-[12.5px] text-fg-muted truncate flex items-center gap-1">
              <ArrowLeftRight size={11} /> Transfer · {transferAccount?.name ?? '—'}
            </div>
          ) : (
            <select
              value={draft.categoryId ?? ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
              className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
            >
              <option value="">— Inflow / Uncategorized —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input
            value={draft.memo}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            placeholder="Memo"
            className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
          />
          <MoneyInput
            value={draft.amount < 0 ? -draft.amount : 0}
            outflow
            onCommit={(v) => setDraft({ ...draft, amount: v === 0 ? 0 : -Math.abs(v) })}
          />
          <MoneyInput
            value={draft.amount > 0 ? draft.amount : 0}
            onCommit={(v) => setDraft({ ...draft, amount: Math.abs(v) })}
          />
          <EditActions
            onSave={save}
            onCancel={cancel}
            onDelete={() => deleteTransaction(txn.id)}
            onRefund={() => openModal({ type: 'expectedRefund', transactionId: txn.id })}
            hasRefund={!!txn.expectedRefund}
          />
        </div>

        {/* Mobile edit form */}
        <div className="md:hidden px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <FlagButton flag={draft.flag} onCycle={(f) => setDraft({ ...draft, flag: f })} />
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-fg flex-1"
            />
            <button onClick={() => deleteTransaction(txn.id)} className="text-negative p-2 rounded hover:bg-negative/15" aria-label="Delete">
              <Trash2 size={16} />
            </button>
          </div>
          {/* Payee row + view-history link. The link sits inline at
              the right so the user can tap to see past transactions
              with this payee without leaving edit mode. */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <PayeeAutocomplete
                big
                value={payeeName(draft.payeeId, payees)}
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
                onClick={(e) => e.stopPropagation()}
                className="text-fg-subtle hover:text-accent flex-shrink-0 p-2 rounded hover:bg-surface-3"
                title="View transaction history with this payee"
                aria-label="View payee history"
              >
                <ExternalLink size={14} />
              </Link>
            )}
          </div>
          {txn.transferAccountId ? (
            <div className="text-[12.5px] text-fg-muted px-2 py-1.5 bg-surface-3/40 rounded flex items-center gap-1">
              <ArrowLeftRight size={11} /> Transfer · {transferAccount?.name ?? '—'}
            </div>
          ) : (
            <select
              value={draft.categoryId ?? ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
              className="h-9 w-full px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
            >
              <option value="">— Category —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input
            value={draft.memo}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            placeholder="Memo"
            className="h-9 w-full px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10.5px] text-fg-subtle uppercase tracking-wider mb-0.5">Outflow</div>
              <MoneyInput
                value={draft.amount < 0 ? -draft.amount : 0}
                outflow
                onCommit={(v) => setDraft({ ...draft, amount: v === 0 ? 0 : -Math.abs(v) })}
                className="w-full"
              />
            </div>
            <div>
              <div className="text-[10.5px] text-fg-subtle uppercase tracking-wider mb-0.5">Inflow</div>
              <MoneyInput
                value={draft.amount > 0 ? draft.amount : 0}
                onCommit={(v) => setDraft({ ...draft, amount: Math.abs(v) })}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => openModal({ type: 'expectedRefund', transactionId: txn.id })}
              className="text-[12px] text-accent hover:underline flex items-center gap-1"
              title="Tag as expecting refund"
            >
              <Hourglass size={12} /> {txn.expectedRefund ? 'Edit refund' : 'Refund?'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={cancel} className="flex-1 h-10 rounded-lg bg-surface-3 text-fg-muted font-medium text-[13px]">Cancel</button>
            <button onClick={save} className="flex-1 h-10 rounded-lg bg-accent text-accent-fg font-medium text-[13px]">Save</button>
          </div>
        </div>
      </div>
    );
  }

  // -------- Read-only display (responsive) --------
  return (
    <>
      {/* Desktop row */}
      <div
        draggable={!editing}
        onDragStart={(e) => {
          // Tier 5 #19: drag-recategorize. Carries the txn id so a
          // category drop target on the budget table can reassign.
          e.dataTransfer.setData('text/x-monii-txn', txn.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        className={cn(
          'txn-row hidden md:grid grid-cols-[24px_28px_92px_1fr_1fr_1fr_110px_110px_84px] items-center gap-1 px-2 py-1.5 border-b border-border/60 hover:bg-surface-2/40 cursor-pointer',
          txn.cleared === 'reconciled' && 'opacity-95',
          selected && 'bg-accent/10',
          detailTxnId === txn.id && 'bg-accent/15',
        )}
        onClick={(e) => {
          // Single-click opens the detail pane on regular layouts.
          // Double-click still triggers inline edit (separate onDoubleClick handler).
          // Don't trigger when clicking interactive cells (handled by their own handlers).
          const target = e.target as HTMLElement;
          if (target.closest('button, input, select')) return;
          setDetailTxnId(detailTxnId === txn.id ? null : txn.id);
        }}
        onDoubleClick={openEdit}
        onContextMenu={(e) => {
          e.preventDefault();
          // Try native context menu first (Tauri desktop). On the web
          // PWA / browser, fall back to the CSS popup. The native call
          // is fire-and-forget — when it returns null (not on Tauri),
          // we open the in-app menu instead.
          (async () => {
            try {
              const { showNativeContextMenu } = await import('../../lib/nativeDesktop');
              const id = await showNativeContextMenu([
                { id: 'cleared', label: txn.cleared === 'cleared' ? 'Mark Uncleared' : 'Mark Cleared' },
                { id: 'flag', label: txn.flag ? 'Clear Flag' : 'Flag (Red)' },
                { id: 'refund', label: txn.expectedRefund ? 'Edit Expected Refund…' : 'Tag Expected Refund…' },
                { id: 'similar', label: 'Find Similar', enabled: !!txn.payeeId },
                { id: 'delete', label: 'Delete', danger: true, separatorBefore: true },
              ]);
              if (id) {
                handleNativeCtx(id);
                return;
              }
            } catch {}
            setCtxMenu({ x: e.clientX, y: e.clientY });
          })();
        }}
      >
        <input
          type="checkbox"
          aria-label={selected ? 'Deselect row' : 'Select row'}
          checked={selected}
          onChange={() => toggleSelected(txn.id)}
          onClick={(e) => e.stopPropagation()}
          className="justify-self-center accent-accent w-3.5 h-3.5 cursor-pointer"
        />
        <FlagButton flag={txn.flag} onCycle={(f) => setFlag(txn.id, f)} />
        <button
          onClick={openEdit}
          className="text-[12.5px] text-fg-muted text-left truncate hover:text-fg flex flex-col"
          title={runningBalance !== undefined ? `Balance after this txn: ${(runningBalance / 100).toFixed(2)}` : undefined}
        >
          <span>{formatDateShort(txn.date)}</span>
          {runningBalance !== undefined && (
            <span
              className={cn(
                'text-[10px] tabular leading-none',
                runningBalance < 0 ? 'text-negative/80' : 'text-fg-subtle/80',
              )}
            >
              <RunningBalanceBadge cents={runningBalance} />
            </span>
          )}
        </button>
        <button onClick={openEdit} className="text-[13px] truncate text-left hover:text-fg flex items-center gap-1.5">
          {txn.transferAccountId && <ArrowLeftRight size={11} className="text-fg-subtle" />}
          <span className="truncate">{payee?.name ?? <span className="text-fg-subtle italic">No payee</span>}</span>
          {showAccount && account && <span className="text-fg-subtle text-[11.5px]">· {account.name}</span>}
        </button>
        <div className="text-[12.5px] truncate">
          {txn.transferAccountId ? (
            <span className="text-fg-muted truncate">Transfer · {transferAccount?.name ?? '—'}</span>
          ) : txn.splits.length > 0 ? (
            <button
              onClick={() => openModal({ type: 'splitEditor', transactionId: txn.id })}
              className="text-fg-muted hover:text-fg italic"
            >
              Split ({txn.splits.length})
            </button>
          ) : category ? (
            <span className="text-fg-muted truncate">{category.name}</span>
          ) : (
            <span className="text-fg-subtle italic">— Inflow —</span>
          )}
        </div>
        <button onClick={openEdit} className="text-[12.5px] text-fg-subtle truncate text-left hover:text-fg">{txn.memo || '—'}</button>
        <div className="text-right tabular text-[13px]">
          {outflow > 0 ? <Money cents={-outflow} monochrome={false} /> : <span className="text-fg-subtle">—</span>}
        </div>
        <div className="text-right tabular text-[13px]">
          {inflow > 0 ? <Money cents={inflow} monochrome={false} /> : <span className="text-fg-subtle">—</span>}
        </div>
        <div className="flex items-center justify-end gap-1 pr-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedTxnId(isExpanded ? null : txn.id);
            }}
            className="text-fg-subtle hover:text-fg p-1 rounded"
            title={isExpanded ? 'Collapse inline detail' : 'Expand inline detail'}
            aria-label={isExpanded ? 'Collapse inline detail' : 'Expand inline detail'}
            aria-expanded={isExpanded}
          >
            <Circle size={9} fill={isExpanded ? 'currentColor' : 'none'} />
          </button>
          {txn.expectedRefund && !txn.expectedRefund.received && (
            <button
              onClick={(e) => { e.stopPropagation(); openModal({ type: 'expectedRefund', transactionId: txn.id }); }}
              className="text-accent hover:bg-accent/15 p-1 rounded"
              title={`Refund expected: ${txn.expectedRefund.amount / 100} by ${txn.expectedRefund.expectedBy}`}
              aria-label="Refund pending"
            >
              <Hourglass size={11} />
            </button>
          )}
          {txn.receiptImageDataUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowReceipt(true); }}
              className="text-fg-subtle hover:text-accent p-1 rounded"
              title="View receipt"
              aria-label="View receipt"
            >
              <Paperclip size={11} />
            </button>
          )}
          <ClearedToggle cleared={txn.cleared} onClick={() => setCleared(txn.id, nextClearedState(txn.cleared))} />
        </div>
      </div>

      {/* Inline expansion strip — alternative to the right-side detail pane.
         Activated by clicking the row chevron (added via the desktop row).
         Shows quick metadata + actions without leaving the table.
         v0.7.28 — payee is now a Link to the per-payee history page,
         with a small pencil affordance to drop straight into edit mode
         on the payee field. */}
      {isExpanded && (
        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-surface-2/30 border-b border-border/60 text-[12px]">
          <div className="text-fg-subtle uppercase tracking-wider text-[10.5px]">Inline detail</div>
          {payee ? (
            <span className="flex items-center gap-1.5">
              <Link
                to={`/payees/${payee.id}`}
                className="hover:text-accent hover:underline"
                title={`View transaction history with ${payee.name}`}
              >
                {payee.name}
              </Link>
              <button
                onClick={openEdit}
                className="text-fg-subtle hover:text-accent p-0.5 rounded"
                title="Edit (incl. fix wrong payee)"
                aria-label="Edit transaction"
              >
                <Pencil size={11} />
              </button>
            </span>
          ) : (
            <span className="italic text-fg-subtle">No payee</span>
          )}
          <span className="text-fg-subtle">·</span>
          <span>{category?.name ?? 'Uncategorized'}</span>
          <span className="text-fg-subtle">·</span>
          <span>{account?.name}</span>
          {txn.memo && <><span className="text-fg-subtle">·</span><span className="italic truncate">{txn.memo}</span></>}
          <button
            onClick={() => setExpandedTxnId(null)}
            className="ml-auto text-fg-subtle hover:text-fg text-[11.5px]"
          >
            collapse
          </button>
        </div>
      )}

      {showReceipt && txn.receiptImageDataUrl && (
        <ReceiptViewer
          txnId={txn.id}
          imageDataUrl={txn.receiptImageDataUrl}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {ctxMenu && (
        <TxnContextMenu
          txnId={txn.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Mobile card */}
      <button
        onClick={(e) => {
          // If the long-press fired, the action sheet is opening — don't
          // also flip into edit mode.
          if (actionSheetOpen) { e.preventDefault(); return; }
          setEditing(true);
        }}
        {...longPress}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        className={cn(
          'md:hidden w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border/60 active:bg-surface-2/60 text-left',
          txn.cleared === 'reconciled' && 'opacity-95',
          selected && 'bg-accent/10',
        )}
      >
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? 'Deselect row' : 'Select row'}
          onClick={(e) => { e.stopPropagation(); toggleSelected(txn.id); }}
          className={cn(
            'w-4 h-4 rounded border grid place-items-center flex-shrink-0',
            selected ? 'bg-accent border-accent text-accent-fg' : 'border-border bg-surface-2',
          )}
        >
          {selected && <Check size={11} />}
        </span>
        <FlagDot flag={txn.flag} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {txn.transferAccountId && <ArrowLeftRight size={11} className="text-fg-subtle flex-shrink-0" />}
            <span className="text-[14px] font-medium truncate">{payee?.name ?? (txn.transferAccountId ? `Transfer to ${transferAccount?.name}` : 'No payee')}</span>
            {txn.receiptImageDataUrl && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setShowReceipt(true); }}
                className="text-fg-subtle hover:text-accent flex-shrink-0"
                aria-label="View receipt"
              >
                <Paperclip size={11} />
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-fg-subtle truncate flex items-center gap-1">
            <span className="tabular">{formatDateShort(txn.date)}</span>
            <span>·</span>
            {showAccount && account && <><span>{account.name}</span><span>·</span></>}
            <span className="truncate">
              {txn.transferAccountId ? (transferAccount?.name ?? '—')
                : txn.splits.length > 0 ? `Split (${txn.splits.length})`
                : category?.name ?? '— Inflow —'}
            </span>
            {txn.memo && <><span>·</span><span className="truncate italic">{txn.memo}</span></>}
            {runningBalance !== undefined && (
              <>
                <span>·</span>
                <span className={cn('tabular', runningBalance < 0 && 'text-negative/80')}>
                  bal <RunningBalanceBadge cents={runningBalance} />
                </span>
              </>
            )}
          </div>
          {/* Tier 14 #3 — tag chips inline. Read-only here; edited via
              the desktop detail pane / mobile action sheet. */}
          {txn.tags && txn.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {txn.tags.slice(0, 3).map((t) => (
                <span key={t} className="inline-block px-1.5 rounded-full bg-accent/15 text-accent text-[10px]">
                  #{t}
                </span>
              ))}
              {txn.tags.length > 3 && (
                <span className="text-[10px] text-fg-subtle">+{txn.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Money cents={txn.amount} className="text-[14px] font-semibold tabular" monochrome={false} />
          <ClearedToggle cleared={txn.cleared} onClick={(e) => { e.stopPropagation(); setCleared(txn.id, nextClearedState(txn.cleared)); }} />
        </div>
      </button>

      {/* Mobile action sheet (long-press) */}
      <TxnActionSheet
        txn={txn}
        payeeName={payee?.name}
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
      />
    </>
  );
}

function nextClearedState(c: ClearedState): ClearedState {
  return c === 'uncleared' ? 'cleared' : c === 'cleared' ? 'reconciled' : 'uncleared';
}

/**
 * Compact running-balance display. Inherits color from caller; uses
 * `useFormatMoney` so currency formatting matches the budget. Pulled
 * into a sub-component so privacy-mode redaction (`••••`) covers it
 * the same way it covers the regular Money component.
 */
function RunningBalanceBadge({ cents }: { cents: number }) {
  const settings = useBudget((s) => s.settings);
  try {
    return (
      <span>
        {new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: settings.currency || 'USD',
          maximumFractionDigits: 0,
        }).format(cents / 100)}
      </span>
    );
  } catch {
    return <span>{(cents / 100).toFixed(0)}</span>;
  }
}

function payeeName(id: string | null, payees: { id: string; name: string }[]): string {
  if (!id) return '';
  if (id.startsWith('__new__:')) return id.slice('__new__:'.length);
  return payees.find((p) => p.id === id)?.name ?? '';
}

function FlagButton({ flag, onCycle }: { flag: FlagColor | null; onCycle: (f: FlagColor | null) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        const cur = flag;
        const next: FlagColor | null = cur === null ? 'red' :
          (FLAG_COLORS.findIndex((f) => f.id === cur) === FLAG_COLORS.length - 1 ? null :
          FLAG_COLORS[FLAG_COLORS.findIndex((f) => f.id === cur) + 1].id);
        onCycle(next);
      }}
      className="text-fg-subtle hover:text-fg p-1.5 rounded justify-self-center"
      title="Click to cycle flag color"
    >
      <Flag size={13} className={cn(flag ? FLAG_COLORS.find((f) => f.id === flag)?.cls : 'text-fg-subtle/60')} fill={flag ? 'currentColor' : 'none'} />
    </button>
  );
}

function FlagDot({ flag }: { flag: FlagColor | null }) {
  if (!flag) return <span className="w-1.5 h-1.5 rounded-full bg-transparent flex-shrink-0" aria-hidden />;
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', `bg-flag-${flag}`)} aria-hidden />;
}

function ClearedToggle({ cleared, onClick }: { cleared: ClearedState; onClick: (e: React.MouseEvent) => void }) {
  // 32×32 tap target on mobile (meets iOS HIG min comfortably) — the visible
  // pill stays small via inner span, so the desktop look is unchanged but
  // touch targets grow.
  return (
    <button
      aria-label="Toggle cleared"
      onClick={onClick}
      className="w-7 h-7 grid place-items-center -m-1 flex-shrink-0"
      title={cleared}
    >
      <span className={cn(
        'w-5 h-5 rounded-full grid place-items-center border',
        cleared === 'cleared' && 'bg-positive/15 text-positive border-positive/40',
        cleared === 'reconciled' && 'bg-positive text-white border-positive',
        cleared === 'uncleared' && 'border-border text-fg-subtle',
      )}>
        {cleared !== 'uncleared' ? <Check size={11} /> : <Circle size={6} />}
      </span>
    </button>
  );
}

function EditActions({ onSave, onCancel, onDelete, onRefund, hasRefund }: { onSave: () => void; onCancel: () => void; onDelete: () => void; onRefund?: () => void; hasRefund?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {onRefund && (
        <button
          onClick={onRefund}
          className={cn('p-1.5 rounded', hasRefund ? 'text-accent hover:bg-accent/15' : 'text-fg-subtle hover:bg-surface-3')}
          aria-label={hasRefund ? 'Edit expected refund' : 'Tag as expecting refund'}
          title={hasRefund ? 'Edit expected refund' : 'Tag as expecting refund'}
          type="button"
        >
          <Hourglass size={14} />
        </button>
      )}
      <button onClick={onSave} className="text-positive hover:bg-positive/15 p-1.5 rounded" aria-label="Save"><Check size={14} /></button>
      <button onClick={onCancel} className="text-fg-muted hover:bg-surface-3 p-1.5 rounded" aria-label="Cancel"><Circle size={14} /></button>
      <button onClick={onDelete} className="text-negative hover:bg-negative/15 p-1.5 rounded" aria-label="Delete"><Trash2 size={14} /></button>
    </div>
  );
}

// PayeeInput removed in v0.7.28 — replaced by PayeeAutocomplete which
// has a custom dropdown (filters as you type, ranks by transaction
// count) and is iOS-keyboard-safe (mousedown + preventDefault on
// suggestions keeps focus on the input). The native <datalist>
// approach used here was a stop-gap; iOS Safari's datalist UI is
// poor and didn't filter meaningfully as the user typed.
