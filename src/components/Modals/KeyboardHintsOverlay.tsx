/**
 * Keyboard shortcuts cheat-sheet. Triggered by `?` from anywhere except
 * inside an input field. Designed as a translucent overlay so the user
 * can scan and dismiss with another `?` or `Escape`.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const SECTIONS: Array<{ title: string; rows: Array<{ keys: string; label: string }> }> = [
  {
    title: 'Navigation',
    rows: [
      { keys: 'g b', label: 'Go to Budget' },
      { keys: 'g a', label: 'Go to Accounts' },
      { keys: 'g r', label: 'Go to Reports' },
      { keys: 'g o', label: 'Go to Goals' },
      { keys: 'g c', label: 'Go to Scheduled' },
      { keys: 'g k', label: 'Go to Credit Cards' },
      { keys: 'g s', label: 'Go to Settings' },
      { keys: '/', label: 'Focus search' },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { keys: '⌘K', label: 'Command palette' },
      { keys: '⌘J', label: 'Chat panel' },
      { keys: '⌘Z', label: 'Undo' },
      { keys: '⌘⇧Z', label: 'Redo' },
      { keys: '⌘E', label: 'Account switcher' },
      { keys: '⌘⇧O', label: 'Quick switcher (Spotlight)' },
      { keys: '⌘.', label: 'Toggle privacy mode' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: '⌘\\', label: 'Toggle sidebar' },
      { keys: 'F11', label: 'Zen mode' },
      { keys: '⇧F11', label: 'Focus mode' },
      { keys: '?', label: 'This help' },
      { keys: 'Esc', label: 'Close menu / clear selection' },
    ],
  },
  {
    title: 'Tabs (desktop)',
    rows: [
      { keys: '⌘T', label: 'New tab' },
      { keys: '⌘W', label: 'Close tab' },
      { keys: '⌘1..9', label: 'Switch to tab N' },
    ],
  },
  {
    title: 'Tables',
    rows: [
      { keys: '↑/↓', label: 'Move between budget cells' },
      { keys: '↵', label: 'Commit + go down' },
      { keys: '⌘C', label: 'Copy selected rows as TSV' },
      { keys: '⌘V', label: 'Paste TSV (in account view)' },
    ],
  },
];

export function KeyboardHintsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as any).isContentEditable);
      if (e.key === '?' && !inField) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div role="dialog" aria-label="Keyboard shortcuts" className="kbd-overlay" onClick={() => setOpen(false)}>
      <div className="kbd-overlay-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold">Keyboard shortcuts</div>
          <button
            onClick={() => setOpen(false)}
            className="text-fg-subtle hover:text-fg p-1 rounded"
            aria-label="Close shortcuts"
          >
            <X size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">{s.title}</div>
              <div className="space-y-0.5">
                {s.rows.map((r) => (
                  <div key={r.keys} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-fg-muted">{r.label}</span>
                    <span className="kbd-style">{r.keys}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
