/**
 * Per-(month, category) assignment memo. A small note icon next to the
 * assigned-amount input. Click to expand into a tiny popover with a
 * textarea — answers "why did I assign $X here this month?" for
 * future-you and any synced devices.
 *
 * The icon is solid when a memo is set, outlined when empty. Memo lives
 * on the `MonthAssignment` record (see types.ts → `MonthAssignment.memo`),
 * not the Category — different reasoning per month is the whole point.
 */

import { useEffect, useRef, useState } from 'react';
import { StickyNote, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { setAssignmentMemo } from '../../db/repo';

export function AssignmentMemo({
  month, categoryId, memo,
}: {
  month: string;
  categoryId: string;
  memo: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(memo ?? '');
  const ref = useRef<HTMLDivElement>(null);

  // Keep draft in sync with the synced value when external changes land.
  useEffect(() => { setDraft(memo ?? ''); }, [memo]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        commit();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  function commit() {
    if (draft.trim() === (memo ?? '').trim()) return;
    setAssignmentMemo(month, categoryId, draft.trim());
  }

  const has = !!(memo && memo.trim());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'p-1 rounded hover:bg-surface-2 transition-colors',
          has ? 'text-accent' : 'text-fg-subtle/60 hover:text-fg-subtle',
        )}
        title={has ? `Note: ${memo}` : 'Add a note about this month\'s assignment'}
        aria-label={has ? 'Edit assignment note' : 'Add assignment note'}
      >
        <StickyNote size={11} fill={has ? 'currentColor' : 'none'} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 glass-panel rounded-lg shadow-glass-lg p-2.5 animate-fade-in">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium">Note for this month</div>
            <button
              onClick={() => { commit(); setOpen(false); }}
              className="text-fg-subtle hover:text-fg p-0.5 rounded"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            placeholder="e.g. saving extra for the trip in May"
            className="w-full text-[12.5px] bg-surface-2 border border-border rounded p-1.5 min-h-[60px] resize-none focus:outline-none focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { commit(); setOpen(false); }
            }}
          />
          <div className="text-[10px] text-fg-subtle mt-1">⌘↵ to save · Esc to close</div>
        </div>
      )}
    </div>
  );
}
