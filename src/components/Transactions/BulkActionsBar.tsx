import { useRef } from 'react';
import { Trash2, Tag, Flag as FlagIcon, Check, X } from 'lucide-react';
import { useUI } from '../../store/ui';
import { useBudget } from '../../store/budget';
import {
  bulkDeleteTransactions, bulkSetCategory, bulkSetFlag, bulkSetCleared,
} from '../../db/repo';
import type { ClearedState, FlagColor } from '../../domain/types';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';
import { undo } from '../../store/undo';

const FLAG_COLORS: Array<{ id: FlagColor; cls: string }> = [
  { id: 'red',    cls: 'bg-flag-red' },
  { id: 'orange', cls: 'bg-flag-orange' },
  { id: 'yellow', cls: 'bg-flag-yellow' },
  { id: 'green',  cls: 'bg-flag-green' },
  { id: 'blue',   cls: 'bg-flag-blue' },
  { id: 'purple', cls: 'bg-flag-purple' },
];

const CLEARED_OPTIONS: ClearedState[] = ['uncleared', 'cleared', 'reconciled'];

/**
 * Sticky action bar above the transaction table when one or more rows are
 * selected. All actions wrap into a single Yjs transaction (via the bulk
 * repo functions) so undo treats the batch as one step.
 */
export function BulkActionsBar() {
  const selected = useUI((s) => s.selectedTxnIds);
  const clear = useUI((s) => s.clearTxnSelection);
  const categories = useBudget((s) => s.categories);
  const catRef = useRef<HTMLSelectElement>(null);
  const clearedRef = useRef<HTMLSelectElement>(null);

  if (selected.size === 0) return null;
  const ids = Array.from(selected);
  const count = ids.length;

  function onSetCategory(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const result = bulkSetCategory(ids, v || null);
    if (catRef.current) catRef.current.value = '';
    const skipped = result.skippedTransfers > 0 ? ` (skipped ${result.skippedTransfers} transfer${result.skippedTransfers === 1 ? '' : 's'})` : '';
    toast.success(`Updated category on ${result.updated} transaction${result.updated === 1 ? '' : 's'}${skipped}`, {
      undo: () => undo(),
    });
  }

  function onSetFlag(flag: FlagColor | null) {
    const result = bulkSetFlag(ids, flag);
    toast.success(`${flag ? `Flagged ${flag}` : 'Cleared flag'} on ${result.updated} transaction${result.updated === 1 ? '' : 's'}`, {
      undo: () => undo(),
    });
  }

  function onSetCleared(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as ClearedState;
    const result = bulkSetCleared(ids, v);
    if (clearedRef.current) clearedRef.current.value = '';
    toast.success(`Marked ${result.updated} transaction${result.updated === 1 ? '' : 's'} as ${v}`, {
      undo: () => undo(),
    });
  }

  function onDelete() {
    if (!confirm(`Delete ${count} transaction${count === 1 ? '' : 's'}? This will also remove the matching half of any selected transfers.`)) return;
    const result = bulkDeleteTransactions(ids);
    clear();
    toast.success(`Deleted ${result.deleted} transaction${result.deleted === 1 ? '' : 's'}`, {
      undo: () => undo(),
    });
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-accent/10 text-fg backdrop-blur">
      <button
        onClick={clear}
        className="text-fg-muted hover:text-fg p-1 -ml-1 rounded"
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        <X size={14} />
      </button>
      <span className="text-[12.5px] font-semibold">
        {count} selected
      </span>
      <span className="h-5 w-px bg-border mx-1" />

      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
        <Tag size={12} />
        <select
          ref={catRef}
          defaultValue=""
          onChange={onSetCategory}
          className="h-7 px-1.5 rounded bg-surface-2 border border-border text-[12px] text-fg"
        >
          <option value="" disabled>Set category…</option>
          <option value="">— Uncategorized —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
        <Check size={12} />
        <select
          ref={clearedRef}
          defaultValue=""
          onChange={onSetCleared}
          className="h-7 px-1.5 rounded bg-surface-2 border border-border text-[12px] text-fg capitalize"
        >
          <option value="" disabled>Set state…</option>
          {CLEARED_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <div className="flex items-center gap-1">
        <FlagIcon size={12} className="text-fg-muted mr-0.5" />
        <button
          onClick={() => onSetFlag(null)}
          className="w-5 h-5 rounded-full border border-border bg-surface-2 grid place-items-center text-[10px] text-fg-subtle hover:bg-surface-3"
          title="Clear flag"
          aria-label="Clear flag"
        >∅</button>
        {FLAG_COLORS.map((f) => (
          <button
            key={f.id}
            onClick={() => onSetFlag(f.id)}
            className={cn('w-5 h-5 rounded-full border border-transparent hover:scale-110 transition', f.cls)}
            title={`Flag ${f.id}`}
            aria-label={`Flag ${f.id}`}
          />
        ))}
      </div>

      <button
        onClick={onDelete}
        className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[12px] text-negative hover:bg-negative/15"
      >
        <Trash2 size={12} /> Delete {count}
      </button>
    </div>
  );
}
