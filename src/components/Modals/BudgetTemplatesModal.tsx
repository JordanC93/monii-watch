/**
 * Budget templates — save the current month's category assignments as
 * a named snapshot, apply any saved snapshot to any month with one
 * click. Useful for users with seasonal patterns ("Standard month",
 * "Tight month", "Holiday month").
 */

import { useState } from 'react';
import { Save, Trash2, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { createBudgetTemplate, applyBudgetTemplate, deleteBudgetTemplate } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { formatMonthLong } from '../../domain/date';
import { toast } from '../../lib/toast';

export function BudgetTemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const templates = useBudget((s) => s.budgetTemplates);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();
  const [newName, setNewName] = useState('');

  function saveCurrent() {
    if (!newName.trim()) return;
    createBudgetTemplate(newName.trim(), month);
    toast.success(`Saved "${newName.trim()}" from ${formatMonthLong(month)}`);
    setNewName('');
  }

  function apply(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Apply "${t.name}" to ${formatMonthLong(month)}? This replaces every assignment in the template; categories not in the template are untouched.`)) return;
    const { applied } = applyBudgetTemplate(id, month);
    toast.success(`Applied ${applied} assignment${applied === 1 ? '' : 's'} from "${t.name}"`);
    onClose();
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? Cannot be undone.`)) return;
    deleteBudgetTemplate(id);
    toast.success(`Deleted "${name}"`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Budget templates"
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        <div className="text-[12.5px] text-fg-muted leading-snug">
          Save the current assignments for <strong className="text-fg">{formatMonthLong(month)}</strong> as a reusable template, or apply an existing template to this month with one click.
        </div>

        <div className="bg-surface-2/40 rounded-lg p-3">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">Save current month as a template</div>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Standard month, Holiday month, Tight month…"
              className="flex-1"
              autoFocus
            />
            <Button variant="primary" onClick={saveCurrent} disabled={!newName.trim()}>
              <Save size={13} /> Save
            </Button>
          </div>
        </div>

        <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Saved templates ({templates.length})</div>
        {templates.length === 0 ? (
          <div className="text-[12.5px] text-fg-subtle text-center py-4 italic">
            No templates yet. Save your first one above.
          </div>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => {
              const total = Object.values(t.assignments).reduce((s, v) => s + v, 0);
              const count = Object.keys(t.assignments).length;
              return (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2/30 hover:bg-surface-2/60">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{t.name}</div>
                    <div className="text-[11.5px] text-fg-subtle">
                      {count} categor{count === 1 ? 'y' : 'ies'} · totals {fmt(total)}
                    </div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => apply(t.id)}>
                    <Check size={12} /> Apply to {formatMonthLong(month).split(' ')[0]}
                  </Button>
                  <button
                    onClick={() => remove(t.id, t.name)}
                    className="text-fg-subtle hover:text-negative p-1.5 rounded"
                    aria-label={`Delete template ${t.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
