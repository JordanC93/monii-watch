/**
 * Auto-allocation rules editor (Tier 6 #1).
 *
 * One row per rule: trigger picker · target category · amount · enabled
 * toggle · delete. Settings → Income & Deductions surfaces this panel.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  createAllocationRule, deleteAllocationRule, updateAllocationRule,
} from '../../db/repo';
import { TRIGGER_LABELS } from '../../domain/allocation';
import { parseAmountToCents } from '../../domain/calc';
import { useFormatMoney } from '../../lib/format';
import type { AllocationRule } from '../../domain/types';

export function AllocationRules() {
  // CRITICAL: don't return derived arrays from Zustand selectors. They
  // create a new reference every render and React 18's
  // useSyncExternalStore (which Zustand v5 uses) detects the unstable
  // snapshot, schedules a resync, and ends up in an infinite loop —
  // "Maximum update depth exceeded." Pull raw fields, derive in render.
  const allocationRulesField = useBudget((s) => s.settings.allocationRules);
  const allCategories = useBudget((s) => s.categories);
  const rules = useMemo(() => allocationRulesField ?? [], [allocationRulesField]);
  const categories = useMemo(() => allCategories.filter((c) => !c.hidden), [allCategories]);
  const fmt = useFormatMoney();
  const [adding, setAdding] = useState(false);

  function addRule(input: Omit<AllocationRule, 'id' | 'createdAt' | 'priority'>) {
    createAllocationRule(input);
    setAdding(false);
  }

  if (rules.length === 0 && !adding) {
    return (
      <div className="space-y-2">
        <div className="text-[11.5px] text-fg-subtle">
          Auto-fill assignments when triggers fire. The rule fires once per
          trigger occurrence and only ADDS — it never overwrites a manual
          change.
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add rule
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-fg-subtle">
        Auto-fill assignments on triggers. Manual overrides win; rules
        only ADD on each fire.
      </div>
      {rules.map((r) => (
        <RuleRow
          key={r.id}
          rule={r}
          categories={categories}
          fmt={fmt}
          onUpdate={(patch) => updateAllocationRule(r.id, patch)}
          onDelete={() => deleteAllocationRule(r.id)}
        />
      ))}
      {adding && (
        <NewRuleRow
          categories={categories}
          onCancel={() => setAdding(false)}
          onAdd={addRule}
        />
      )}
      {!adding && (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add rule
        </Button>
      )}
    </div>
  );
}

function RuleRow({
  rule, categories, fmt, onUpdate, onDelete,
}: {
  rule: AllocationRule;
  categories: import('../../domain/types').Category[];
  fmt: (cents: number) => string;
  onUpdate: (patch: Partial<AllocationRule>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState((rule.amount / 100).toString());
  const [thresholdDraft, setThresholdDraft] = useState(
    rule.threshold ? (rule.threshold / 100).toString() : '',
  );

  function commitAmount() {
    const cents = parseAmountToCents(draft);
    if (cents !== null && cents > 0) onUpdate({ amount: cents });
    else setDraft((rule.amount / 100).toString());
  }
  function commitThreshold() {
    const cents = parseAmountToCents(thresholdDraft);
    onUpdate({ threshold: cents !== null && cents > 0 ? cents : undefined });
  }

  return (
    <div className="bg-surface-2/40 rounded-md p-2.5 space-y-1.5 ring-1 ring-border">
      <div className="grid grid-cols-[1fr_36px] sm:grid-cols-[1fr_1fr_120px_36px] gap-1.5 items-center">
        <Select
          value={rule.trigger}
          onChange={(e) => onUpdate({ trigger: e.target.value as AllocationRule['trigger'] })}
          className="text-[12px]"
        >
          {(Object.keys(TRIGGER_LABELS) as AllocationRule['trigger'][]).map((k) => (
            <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
          ))}
        </Select>
        <Select
          value={rule.targetCategoryId}
          onChange={(e) => onUpdate({ targetCategoryId: e.target.value })}
          className="text-[12px] hidden sm:block"
        >
          <option value="">(pick category)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAmount(); }}
          inputMode="decimal"
          placeholder="0.00"
          className="text-right tabular text-[12.5px]"
        />
        <button
          onClick={onDelete}
          className="text-fg-subtle hover:text-negative p-1.5 rounded"
          aria-label="Delete rule"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="block sm:hidden">
        <Select
          value={rule.targetCategoryId}
          onChange={(e) => onUpdate({ targetCategoryId: e.target.value })}
          className="text-[12px] w-full"
        >
          <option value="">(pick category)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>
      {rule.trigger === 'income-over' && (
        <div className="flex items-center gap-2 text-[11.5px] text-fg-subtle">
          <span>Threshold:</span>
          <Input
            value={thresholdDraft}
            onChange={(e) => setThresholdDraft(e.target.value)}
            onBlur={commitThreshold}
            inputMode="decimal"
            placeholder="0.00"
            className="text-right tabular text-[12px] w-24"
          />
          {rule.threshold && <span>(fires when inflow ≥ {fmt(rule.threshold)})</span>}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted cursor-pointer">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          className="accent-accent"
        />
        <span>Enabled</span>
        {rule.lastFiredOn && (
          <span className="text-fg-subtle">· last fired {rule.lastFiredOn}</span>
        )}
      </label>
    </div>
  );
}

function NewRuleRow({
  categories, onCancel, onAdd,
}: {
  categories: import('../../domain/types').Category[];
  onCancel: () => void;
  onAdd: (input: Omit<AllocationRule, 'id' | 'createdAt' | 'priority'>) => void;
}) {
  const [trigger, setTrigger] = useState<AllocationRule['trigger']>('paycheck');
  const [targetCategoryId, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [threshold, setThreshold] = useState('');

  function submit() {
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) return;
    if (!targetCategoryId) return;
    const thresh = parseAmountToCents(threshold);
    onAdd({
      trigger,
      amount: cents,
      targetCategoryId,
      enabled: true,
      threshold: trigger === 'income-over' && thresh && thresh > 0 ? thresh : undefined,
    });
  }

  return (
    <div className="bg-surface-2/60 rounded-md p-2.5 space-y-2 ring-1 ring-accent/40">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px] gap-1.5">
        <Select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as AllocationRule['trigger'])}
          className="text-[12px]"
        >
          {(Object.keys(TRIGGER_LABELS) as AllocationRule['trigger'][]).map((k) => (
            <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
          ))}
        </Select>
        <Select
          value={targetCategoryId}
          onChange={(e) => setTarget(e.target.value)}
          className="text-[12px]"
        >
          <option value="">(pick category)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="text-right tabular text-[12.5px]"
        />
      </div>
      {trigger === 'income-over' && (
        <Input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          placeholder="Income threshold (e.g. 1000.00)"
          className="text-[12.5px]"
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>Add</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
