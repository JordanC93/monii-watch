/**
 * Sandbox controls modal (Tier 7 #5).
 *
 * Lets the user define the overlays:
 *   - Income override
 *   - Hypothetical scheduled transactions ("$500 car payment monthly")
 *
 * Per-category assignment edits flow through the existing
 * BudgetTable — when sandbox is active, the table writes to the
 * sandbox slice instead of the live store. (See `MoneyInput`'s
 * sandbox-aware commit path.)
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useSandbox, newSandboxScheduledId } from '../../store/sandbox';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { parseAmountToCents } from '../../domain/calc';
import { FREQUENCY_LABELS } from '../../domain/recurrence';
import { todayIso } from '../../domain/date';
import type { RecurrenceFrequency } from '../../domain/types';

export function SandboxControls({ onClose }: { onClose: () => void }) {
  // Don't filter inside the selector — returns a new array each render
  // and causes the Zustand-on-React-18 infinite loop. Pull raw, derive
  // in render with useMemo.
  const allAccounts = useBudget((s) => s.accounts);
  const allCategoriesRaw = useBudget((s) => s.categories);
  const accounts = useMemo(() => allAccounts.filter((a) => !a.closed), [allAccounts]);
  const categories = useMemo(() => allCategoriesRaw.filter((c) => !c.hidden), [allCategoriesRaw]);
  const monthlyIncomeOverride = useSandbox((s) => s.monthlyIncomeOverride);
  const setMonthlyIncomeOverride = useSandbox((s) => s.setMonthlyIncomeOverride);
  const scheduled = useSandbox((s) => s.scheduled);
  const upsertScheduled = useSandbox((s) => s.upsertScheduled);
  const removeScheduled = useSandbox((s) => s.removeScheduled);
  const liveIncome = useBudget((s) => s.settings.monthlyIncome);
  const fmt = useFormatMoney();

  const [incomeText, setIncomeText] = useState(
    monthlyIncomeOverride !== null
      ? (monthlyIncomeOverride / 100).toString()
      : (liveIncome > 0 ? (liveIncome / 100).toString() : ''),
  );

  const [newPayee, setNewPayee] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newAccountId, setNewAccountId] = useState(accounts[0]?.id ?? '');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newFreq, setNewFreq] = useState<RecurrenceFrequency>('monthly');
  const [newStart, setNewStart] = useState(todayIso());
  const [newOutflow, setNewOutflow] = useState(true);

  function commitIncome() {
    const cents = parseAmountToCents(incomeText);
    if (cents === null) return;
    setMonthlyIncomeOverride(cents);
  }
  function clearIncome() {
    setIncomeText('');
    setMonthlyIncomeOverride(null);
  }

  function addScheduled() {
    const cents = parseAmountToCents(newAmount);
    if (!cents || cents <= 0) return;
    if (!newAccountId) return;
    const signed = newOutflow ? -cents : cents;
    upsertScheduled({
      id: newSandboxScheduledId(),
      accountId: newAccountId,
      payee: newPayee.trim() || 'Hypothetical',
      categoryId: newOutflow ? (newCategoryId || null) : null,
      amount: signed,
      memo: 'Sandbox',
      frequency: newFreq,
      startDate: newStart,
    });
    setNewPayee('');
    setNewAmount('');
  }

  return (
    <Modal open onClose={onClose} title="Sandbox controls" size="lg">
      <div className="space-y-4">
        {/* Income override */}
        <div>
          <div className="text-[12.5px] font-medium mb-1.5">Monthly income override</div>
          <div className="flex items-center gap-2">
            <Input
              value={incomeText}
              onChange={(e) => setIncomeText(e.target.value)}
              onBlur={commitIncome}
              onKeyDown={(e) => { if (e.key === 'Enter') commitIncome(); }}
              inputMode="decimal"
              placeholder={liveIncome > 0 ? (liveIncome / 100).toString() : '0.00'}
              className="w-32 text-right tabular"
            />
            {monthlyIncomeOverride !== null && (
              <button onClick={clearIncome} className="text-[11.5px] text-fg-subtle hover:text-fg">
                Clear override
              </button>
            )}
          </div>
          <div className="text-[11px] text-fg-subtle mt-1">
            Live income: <strong>{fmt(liveIncome)}</strong>. Sandbox value flows through cash-flow forecast + safe-to-spend.
          </div>
        </div>

        {/* Hypothetical scheduled */}
        <div className="border-t border-border pt-3">
          <div className="text-[12.5px] font-medium mb-1.5">Hypothetical recurring transactions</div>
          <div className="text-[11px] text-fg-subtle mb-2">
            "What if I had a $500 car payment starting next month?" Adds it to the cash-flow forecast without committing.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
            <Input
              value={newPayee}
              onChange={(e) => setNewPayee(e.target.value)}
              placeholder="Payee"
              className="text-[12px]"
            />
            <Input
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="text-right tabular text-[12px]"
            />
            <Select value={newFreq} onChange={(e) => setNewFreq(e.target.value as RecurrenceFrequency)} className="text-[12px]">
              {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((k) => (
                <option key={k} value={k}>{FREQUENCY_LABELS[k]}</option>
              ))}
            </Select>
            <Input
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-2">
            <Select value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)} className="text-[12px]">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} className="text-[12px]" disabled={!newOutflow}>
              <option value="">— Uncategorized —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={newOutflow ? 'outflow' : 'inflow'} onChange={(e) => setNewOutflow(e.target.value === 'outflow')} className="text-[12px]">
              <option value="outflow">Outflow (bill)</option>
              <option value="inflow">Inflow (income)</option>
            </Select>
          </div>
          <Button size="sm" onClick={addScheduled}>
            <Plus size={12} /> Add hypothetical
          </Button>

          {scheduled.length > 0 && (
            <div className="space-y-1 mt-3 pt-3 border-t border-border">
              {scheduled.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[12px] py-1">
                  <div className="flex-1 min-w-0 truncate">
                    {s.payee} · <span className={s.amount < 0 ? 'text-negative' : 'text-positive'}>{fmt(s.amount)}</span> · {FREQUENCY_LABELS[s.frequency]} from {s.startDate}
                  </div>
                  <button
                    onClick={() => removeScheduled(s.id)}
                    className="text-fg-subtle hover:text-negative p-1 rounded"
                    aria-label="Remove"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-fg-subtle italic">
          Tip: while sandbox is active, edits to assignments in the budget table are ALSO captured as overlays. Hit "Apply" in the banner to commit, or "Discard" to throw away.
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
