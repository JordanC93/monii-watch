/**
 * Customize Reports dashboard — drag to reorder cards, hide individual ones.
 *
 * Lives in `Settings.reportsOrder`. Empty = default order in ReportsPage.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';

const DEFAULT_REPORT_CARDS = [
  { key: 'pending-refunds', label: 'Pending refunds' },
  { key: 'tax-prep', label: 'Tax preparation' },
  { key: 'iou', label: 'IOU ledger' },
  { key: 'subscription-creep', label: 'Subscription price changes' },
  { key: 'spending-by-category', label: 'Spending by Category' },
  { key: 'cash-flow-forecast', label: 'Cash Flow Forecast' },
  { key: 'income-vs-expenses', label: 'Income vs Expenses' },
  { key: 'what-if', label: 'What if?' },
  { key: 'sankey', label: 'Money flow (Sankey)' },
  { key: 'spending-by-payee', label: 'Spending by Payee' },
  { key: 'category-heatmap', label: 'Category Heatmap' },
  { key: 'bills-trend', label: 'Bills & Spending Over Time' },
  { key: 'net-worth', label: 'Net Worth' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'debt-payoff', label: 'Debt Payoff Planner' },
  { key: 'tax-calc', label: 'Tax Estimator' },
];

// Stable fallback — never inline `?? []` in a Zustand selector (Iron Rule #21).
const EMPTY_REPORTS_ORDER: Array<{ key: string; order: number; hidden: boolean }> = [];

export function ReportsCustomizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const storedRaw = useBudget((s) => s.settings.reportsOrder);
  const stored = storedRaw ?? EMPTY_REPORTS_ORDER;
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
    setEntries(DEFAULT_REPORT_CARDS.map((d, i) => ({ key: d.key, label: d.label, order: i, hidden: false })));
  }
  function save() {
    const out = entries.map((e, i) => ({ key: e.key, order: i, hidden: e.hidden }));
    setSettingsField('reportsOrder', out);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Reports dashboard"
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
          Drag to reorder. Click the eye to hide cards you don&apos;t use. Synced.
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
    return DEFAULT_REPORT_CARDS.map((d, i) => ({ key: d.key, label: d.label, order: i, hidden: false }));
  }
  const labelByKey = Object.fromEntries(DEFAULT_REPORT_CARDS.map((d) => [d.key, d.label]));
  const sorted = [...stored].sort((a, b) => a.order - b.order);
  const result = sorted.map((s) => ({ key: s.key, label: labelByKey[s.key] ?? s.key, order: s.order, hidden: s.hidden }));
  for (const d of DEFAULT_REPORT_CARDS) {
    if (!stored.some((s) => s.key === d.key)) result.push({ key: d.key, label: d.label, order: result.length, hidden: false });
  }
  return result;
}

