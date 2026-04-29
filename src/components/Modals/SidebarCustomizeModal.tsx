/**
 * Customize the sidebar — drag-reorder nav entries, pin or hide.
 *
 * Lives in `Settings.sidebarOrder`. When the array is empty, the
 * sidebar uses the default order in Sidebar.tsx. Once the user touches
 * any entry, the array is populated with full state and Sidebar.tsx
 * uses it.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';

const DEFAULT_ENTRIES = [
  { key: 'budget', label: 'Budget' },
  { key: 'accounts', label: 'All Accounts' },
  { key: 'reports', label: 'Reports' },
  { key: 'goals', label: 'Goals' },
  { key: 'credit-cards', label: 'Credit Cards' },
  { key: 'investments', label: 'Investments' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'trips', label: 'Trips & events' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'auto-rules', label: 'Auto-rules' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'search', label: 'Search' },
  { key: 'settings', label: 'Settings' },
];

export function SidebarCustomizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stored = useBudget((s) => s.settings.sidebarOrder ?? []);
  const [entries, setEntries] = useState(() => buildInitial(stored));
  const [dragId, setDragId] = useState<string | null>(null);

  function reorder(id: string, targetId: string) {
    setEntries((cur) => {
      const next = cur.slice();
      const fromIdx = next.findIndex((e) => e.key === id);
      const toIdx = next.findIndex((e) => e.key === targetId);
      if (fromIdx < 0 || toIdx < 0) return cur;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }
  function toggleHidden(key: string) {
    setEntries((cur) => cur.map((e) => e.key === key ? { ...e, hidden: !e.hidden } : e));
  }
  function reset() {
    setEntries(DEFAULT_ENTRIES.map((d, i) => ({ key: d.key, label: d.label, order: i, hidden: false })));
  }
  function save() {
    const out = entries.map((e, i) => ({ key: e.key, order: i, hidden: e.hidden }));
    setSettingsField('sidebarOrder', out);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize sidebar"
      size="md"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={reset}><RotateCcw size={13} /> Reset</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-1 text-[13px]">
        <p className="text-fg-muted text-[12px] mb-3">
          Drag to reorder. Click the eye to hide. Synced across devices.
        </p>
        {entries.map((e) => (
          <div
            key={e.key}
            draggable
            onDragStart={() => setDragId(e.key)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(ev) => { if (dragId && dragId !== e.key) ev.preventDefault(); }}
            onDrop={(ev) => { if (dragId) { ev.preventDefault(); reorder(dragId, e.key); } }}
            className={`flex items-center gap-2 px-2 py-1.5 rounded border ${dragId === e.key ? 'opacity-50 border-accent' : 'border-border bg-surface-2/30'}`}
          >
            <GripVertical size={12} className="text-fg-subtle cursor-grab" />
            <span className={`flex-1 ${e.hidden ? 'opacity-50 line-through' : ''}`}>{e.label}</span>
            <button
              onClick={() => toggleHidden(e.key)}
              className="text-fg-subtle hover:text-fg p-1 rounded"
              aria-label={e.hidden ? 'Show' : 'Hide'}
              title={e.hidden ? 'Show' : 'Hide'}
            >
              {e.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function buildInitial(stored: Array<{ key: string; order: number; hidden: boolean }>) {
  if (stored.length === 0) {
    return DEFAULT_ENTRIES.map((d, i) => ({ key: d.key, label: d.label, order: i, hidden: false }));
  }
  // Reconstruct order from stored, falling back to defaults for any missing.
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const labelByKey = Object.fromEntries(DEFAULT_ENTRIES.map((d) => [d.key, d.label]));
  const sorted = [...stored].sort((a, b) => a.order - b.order);
  const result = sorted.map((s) => ({ key: s.key, label: labelByKey[s.key] ?? s.key, order: s.order, hidden: s.hidden }));
  // Append any default entries that aren't in `stored` so new entries
  // surface for users who customized the sidebar before they were added.
  for (const d of DEFAULT_ENTRIES) {
    if (!byKey.has(d.key)) result.push({ key: d.key, label: d.label, order: result.length, hidden: false });
  }
  return result;
}
