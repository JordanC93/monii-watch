/**
 * Lightweight right-click context menu for transaction rows.
 *
 * Tier 4 #2 (minimal version): on right-click, show a popup with a
 * scoped action set — Categorize as / Mark cleared / Flag /
 * Find similar / Delete / Tag refund. The full visual context menu
 * for budget rows + sidebar accounts is a larger lift; this is the
 * narrow first cut that proves the keyboard convention.
 */

import { useEffect, useRef } from 'react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import {
  setCleared, setFlag, deleteTransaction, updateTransaction,
  setTransactionOneTime, incrementTransactionUsage,
} from '../../db/repo';
import { useNavigate } from 'react-router-dom';
import { Tag, Flag as FlagIcon, Trash2, Hourglass, Search, CheckCircle2, Repeat, Activity } from 'lucide-react';

type Props = {
  txnId: string;
  x: number;
  y: number;
  onClose: () => void;
};

export function TxnContextMenu({ txnId, x, y, onClose }: Props) {
  const txn = useBudget((s) => s.transactions.find((t) => t.id === txnId));
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const openModal = useUI((s) => s.openModal);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      // Arrow-key navigation between menu items.
      if (!ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const cur = document.activeElement as HTMLElement | null;
      const idx = cur ? items.indexOf(cur as HTMLButtonElement) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[Math.min(idx + 1, items.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[Math.max(idx - 1, 0)]?.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    // Auto-focus the first menu item on mount so keyboard users land in
    // the menu immediately.
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!txn) return null;

  const payee = payees.find((p) => p.id === txn.payeeId);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Transaction actions"
      className="fixed z-50 bg-elevated border border-border rounded-lg shadow-glass-lg overflow-hidden text-[12.5px] min-w-[200px] py-1 glass-panel"
      style={{ top: y, left: x }}
    >
      <Section title="Categorize" icon={<Tag size={12} />}>
        <div className="max-h-44 overflow-y-auto">
          {categories.filter((c) => !c.hidden).slice(0, 12).map((c) => (
            <button
              key={c.id}
              role="menuitem"
              className="w-full text-left px-3 py-1 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              onClick={() => {
                updateTransaction(txn.id, { categoryId: c.id });
                onClose();
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Section>
      <MenuItem
        icon={<CheckCircle2 size={12} />}
        label={txn.cleared === 'cleared' ? 'Mark uncleared' : 'Mark cleared'}
        onClick={() => { setCleared(txn.id, txn.cleared === 'cleared' ? 'uncleared' : 'cleared'); onClose(); }}
      />
      <MenuItem
        icon={<FlagIcon size={12} />}
        label={txn.flag ? 'Clear flag' : 'Flag (red)'}
        onClick={() => { setFlag(txn.id, txn.flag ? null : 'red'); onClose(); }}
      />
      <MenuItem
        icon={<Hourglass size={12} />}
        label={txn.expectedRefund ? 'Edit expected refund' : 'Tag as expecting refund'}
        onClick={() => { openModal({ type: 'expectedRefund', transactionId: txn.id }); onClose(); }}
      />
      <MenuItem
        icon={<Search size={12} />}
        label="Find similar (this payee)"
        onClick={() => {
          if (payee) nav(`/search?payee=${encodeURIComponent(payee.name)}`);
          onClose();
        }}
        disabled={!payee}
      />
      <MenuItem
        icon={<Repeat size={12} />}
        label={txn.oneTime ? 'Unmark as one-time' : 'Mark as one-time'}
        onClick={() => { setTransactionOneTime(txn.id, !txn.oneTime); onClose(); }}
      />
      <MenuItem
        icon={<Activity size={12} />}
        label={`Track usage${typeof txn.usageCount === 'number' ? ` (${txn.usageCount})` : ''} — +1`}
        onClick={() => { incrementTransactionUsage(txn.id, 1); onClose(); }}
      />
      <div className="border-t border-border my-1" />
      <MenuItem
        icon={<Trash2 size={12} />}
        label="Delete"
        danger
        onClick={() => {
          if (confirm('Delete this transaction?')) deleteTransaction(txn.id);
          onClose();
        }}
      />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1 text-[10.5px] uppercase tracking-wider text-fg-subtle flex items-center gap-1">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-50 ${danger ? 'text-negative' : ''}`}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  );
}
