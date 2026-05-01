/**
 * Mobile transaction action sheet (Tier 12 #4). Slides up from the
 * bottom on long-press of a transaction row. iOS-style: a sheet
 * with a grab handle, large touch targets, and a Cancel button at
 * the bottom.
 *
 * The desktop equivalent is the `TxnContextMenu` triggered by
 * right-click. This sheet covers the touch-only flow — the `Search`
 * page bulk select still requires the row checkbox, which is
 * intentional.
 *
 * Actions match the desktop context menu so muscle memory is the
 * same once you switch devices: cleared toggle, flag cycle, find
 * similar, expected refund, delete.
 */

import { Check, Flag, Search, Receipt as ReceiptIcon, Tag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../../store/ui';
import {
  setCleared as setClearedRepo,
  setFlag as setFlagRepo,
  deleteTransaction,
} from '../../db/repo';
import { toast } from '../../lib/toast';
import type { Transaction } from '../../domain/types';
import { useEffect } from 'react';

type Props = {
  txn: Transaction;
  payeeName?: string;
  open: boolean;
  onClose: () => void;
};

export function TxnActionSheet({ txn, payeeName, open, onClose }: Props) {
  const openModal = useUI((s) => s.openModal);
  const nav = useNavigate();

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const nextCleared = txn.cleared === 'cleared' ? 'uncleared' : 'cleared';

  function close() {
    onClose();
  }

  function handleCleared() {
    setClearedRepo(txn.id, nextCleared);
    toast.success(`Marked ${nextCleared}.`);
    close();
  }
  function handleFlag() {
    const nextFlag = txn.flag === null ? 'red' : null;
    setFlagRepo(txn.id, nextFlag);
    toast.success(nextFlag ? 'Flagged.' : 'Flag cleared.');
    close();
  }
  function handleSplit() {
    openModal({ type: 'splitEditor', transactionId: txn.id });
    close();
  }
  function handleRefund() {
    openModal({ type: 'expectedRefund', transactionId: txn.id });
    close();
  }
  function handleSimilar() {
    if (!payeeName) { close(); return; }
    nav(`/search?payee=${encodeURIComponent(payeeName)}`);
    close();
  }
  function handleDelete() {
    if (!confirm(`Delete this transaction? It moves to trash for 30 days.`)) return;
    deleteTransaction(txn.id);
    toast.success('Moved to trash.');
    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:hidden"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-surface rounded-t-2xl shadow-2xl pb-safe"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0), 0.5rem)',
          animation: 'sheet-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* Grab handle */}
        <div className="pt-2.5 pb-3 grid place-items-center">
          <div className="w-10 h-1 rounded-full bg-fg-subtle/40" />
        </div>

        {/* Title strip */}
        <div className="px-5 pb-3 border-b border-border">
          <div className="text-[14px] font-semibold truncate">
            {payeeName ?? 'Transaction'}
          </div>
          <div className="text-[11.5px] text-fg-subtle tabular">{txn.date}</div>
        </div>

        {/* Actions */}
        <div className="py-2">
          <SheetButton icon={<Check size={18} />} onClick={handleCleared}>
            Mark {nextCleared}
          </SheetButton>
          <SheetButton icon={<Flag size={18} />} onClick={handleFlag}>
            {txn.flag ? 'Clear flag' : 'Flag'}
          </SheetButton>
          <SheetButton icon={<Tag size={18} />} onClick={handleSplit}>
            Edit splits…
          </SheetButton>
          <SheetButton icon={<ReceiptIcon size={18} />} onClick={handleRefund}>
            {txn.expectedRefund ? 'Edit expected refund…' : 'Tag expected refund…'}
          </SheetButton>
          {payeeName && (
            <SheetButton icon={<Search size={18} />} onClick={handleSimilar}>
              Find similar transactions
            </SheetButton>
          )}
          <SheetButton icon={<Trash2 size={18} />} onClick={handleDelete} danger>
            Delete (move to trash)
          </SheetButton>
        </div>

        {/* Cancel */}
        <div className="px-3 pb-2">
          <button
            onClick={close}
            className="w-full h-12 rounded-xl bg-surface-2 text-fg font-medium text-[15px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetButton({
  icon, children, onClick, danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-3 px-5 py-3.5 active:bg-surface-2 text-left text-[15px] '
        + (danger ? 'text-negative' : 'text-fg')
      }
    >
      <span className={danger ? 'text-negative' : 'text-fg-muted'}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}
