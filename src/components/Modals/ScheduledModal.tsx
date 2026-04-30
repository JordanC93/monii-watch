import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { createScheduled, updateScheduled, deleteScheduled } from '../../db/repo';
import { parseAmountToCents } from '../../domain/calc';
import { todayIso } from '../../domain/date';
import { FREQUENCY_LABELS } from '../../domain/recurrence';
import type { RecurrenceFrequency } from '../../domain/types';

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, edit this scheduled transaction; otherwise create a new one. */
  scheduledId?: string;
};

export function ScheduledModal({ open, onClose, scheduledId }: Props) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const existing = useBudget((s) => s.scheduled.find((x) => x.id === scheduledId));

  const initialAccount = existing?.accountId ?? accounts[0]?.id ?? '';
  const initialPayee = existing?.payeeId
    ? (payees.find((p) => p.id === existing.payeeId)?.name ?? '')
    : '';
  const initialOutflow = existing && existing.amount < 0
    ? (Math.abs(existing.amount) / 100).toString() : '';
  const initialInflow = existing && existing.amount > 0
    ? (existing.amount / 100).toString() : '';

  const [accountId, setAccountId] = useState(initialAccount);
  const [payee, setPayee] = useState(initialPayee);
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? '');
  const [transferTo, setTransferTo] = useState<string>(existing?.transferAccountId ?? '');
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [outflow, setOutflow] = useState(initialOutflow);
  const [inflow, setInflow] = useState(initialInflow);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(existing?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  // Tier 9 #5 — auto-escalation. Stored as a decimal (0.03 = +3%/yr).
  // UI shows it as a whole-number percent for less friction.
  const [escalationPctText, setEscalationPctText] = useState(
    existing?.escalationPctPerYear ? (existing.escalationPctPerYear * 100).toString() : '',
  );
  // Tier 10 #11 — goal contribution auto-deposit. Each materialization
  // bumps the assignment for this category. Most useful for transfers
  // ("$200 from Checking → Savings AND assign $200 to the Vacation
  // envelope") but works on any scheduled entry. Empty = no
  // envelope side effect.
  const [autoAssignCategoryId, setAutoAssignCategoryId] = useState<string>(existing?.autoAssignCategoryId ?? '');

  const isTransfer = !!transferTo;
  const isEdit = !!existing;

  function save() {
    if (!accountId) return;
    let amount = 0;
    const o = parseAmountToCents(outflow);
    const i = parseAmountToCents(inflow);
    if (o !== null && o !== 0) amount = -Math.abs(o);
    else if (i !== null && i !== 0) amount = Math.abs(i);
    else return;
    if (!startDate) return;

    const escalationPct = parseFloat(escalationPctText);
    const escalationPctPerYear = Number.isFinite(escalationPct) && escalationPct !== 0
      ? escalationPct / 100
      : undefined;

    if (isEdit && existing) {
      updateScheduled(existing.id, {
        accountId,
        payee: isTransfer ? null : (payee.trim() || null),
        categoryId: isTransfer ? null : (categoryId || null),
        transferAccountId: transferTo || null,
        amount,
        memo,
        frequency,
        startDate,
        endDate: endDate || null,
        escalationPctPerYear,
        autoAssignCategoryId: autoAssignCategoryId || undefined,
        // Only reset nextDate if startDate changed forward — otherwise the
        // user keeps their place in the schedule.
        ...(startDate !== existing.startDate && startDate > existing.nextDate
          ? { nextDate: startDate }
          : {}),
      });
    } else {
      createScheduled({
        accountId,
        payee: isTransfer ? null : (payee.trim() || null),
        categoryId: isTransfer ? null : (categoryId || null),
        transferAccountId: transferTo || null,
        amount,
        memo,
        frequency,
        startDate,
        endDate: endDate || null,
        escalationPctPerYear,
        autoAssignCategoryId: autoAssignCategoryId || undefined,
      });
    }
    onClose();
  }

  function remove() {
    if (!existing) return;
    if (!confirm('Delete this scheduled transaction? Past materializations will remain.')) return;
    deleteScheduled(existing.id);
    onClose();
  }

  if (accounts.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Scheduled Transaction"
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>}>
        <div className="text-[13px] text-fg-muted">Add an account first to schedule transactions.</div>
      </Modal>
    );
  }

  const canSave = !!accountId && !!startDate && (
    parseAmountToCents(outflow) || parseAmountToCents(inflow)
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Scheduled Transaction' : 'New Scheduled Transaction'}
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          {isEdit
            ? <Button variant="danger" onClick={remove}>Delete</Button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!canSave}>
              {isEdit ? 'Save' : 'Schedule'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-fg-muted">Account</label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[12px] text-fg-muted">Frequency</label>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)} className="mt-1">
              {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="text-[12px] text-fg-muted">Payee or Transfer</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Input
              list="scheduled-payees-datalist"
              value={payee}
              onChange={(e) => { setPayee(e.target.value); if (e.target.value) setTransferTo(''); }}
              placeholder="Payee"
              disabled={isTransfer}
              className="w-full"
            />
            <Select
              value={transferTo}
              onChange={(e) => { setTransferTo(e.target.value); if (e.target.value) { setPayee(''); setCategoryId(''); } }}
            >
              <option value="">— Or pick transfer destination —</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>↔ {a.name}</option>
              ))}
            </Select>
          </div>
          <datalist id="scheduled-payees-datalist">
            {payees.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </div>

        {!isTransfer && (
          <div>
            <label className="text-[12px] text-fg-muted">Category</label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1"
            >
              <option value="">— Uncategorized —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-fg-muted">Outflow</label>
            <Input
              value={outflow}
              onChange={(e) => { setOutflow(e.target.value); if (e.target.value) setInflow(''); }}
              placeholder="0.00"
              inputMode="decimal"
              className="mt-1 text-right tabular w-full"
            />
          </div>
          <div>
            <label className="text-[12px] text-fg-muted">Inflow</label>
            <Input
              value={inflow}
              onChange={(e) => { setInflow(e.target.value); if (e.target.value) setOutflow(''); }}
              placeholder="0.00"
              inputMode="decimal"
              className="mt-1 text-right tabular w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-fg-muted">First date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-[12px] text-fg-muted">End date <span className="text-fg-subtle">(optional)</span></label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full"
            />
          </div>
        </div>

        <div>
          <label className="text-[12px] text-fg-muted">Memo</label>
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full"
          />
        </div>

        {/* Tier 9 #5 — auto-escalation. Hidden behind a small section
            since it's a power-user knob. Useful primarily for retirement
            contribution scheduling ("auto-raise my 401k 1%/yr"). */}
        <div>
          <label className="text-[12px] text-fg-muted">
            Auto-escalate per year <span className="text-fg-subtle">(optional)</span>
          </label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={escalationPctText}
              onChange={(e) => setEscalationPctText(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-20 text-right tabular"
            />
            <span className="text-[12px] text-fg-muted">% per year</span>
          </div>
          <div className="text-[10.5px] text-fg-subtle mt-1">
            Multiplies the amount on each anniversary of the start date.
            E.g. <code>3</code> = "raise by 3%/year." Useful for retirement
            contribution auto-escalation.
          </div>
        </div>

        {/* Tier 10 #11 — goal contribution auto-deposit. Picks an
            envelope to also fund on each materialization. Most useful
            for transfer-style schedules ("move $200 to Savings AND
            assign $200 to Vacation envelope"). Doesn't replace the
            existing assignment — adds to it. */}
        <div>
          <label className="text-[12px] text-fg-muted">
            Also assign to envelope <span className="text-fg-subtle">(optional)</span>
          </label>
          <Select
            value={autoAssignCategoryId}
            onChange={(e) => setAutoAssignCategoryId(e.target.value)}
            className="mt-1 w-full"
          >
            <option value="">— Don&apos;t auto-deposit —</option>
            {categories.filter((c) => !c.hidden).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <div className="text-[10.5px] text-fg-subtle mt-1">
            On each materialization, also bump this envelope's assignment
            by the absolute amount. Useful when you actually move money
            (transfer to Savings) AND want the envelope funded.
          </div>
        </div>

        {isEdit && existing && (
          <div className="text-[11.5px] text-fg-subtle border-t border-border pt-2">
            Next due {existing.nextDate}
            {existing.lastRunAt
              ? ` · last ran ${new Date(existing.lastRunAt).toLocaleDateString()}`
              : ' · never run yet'}
          </div>
        )}
      </div>
    </Modal>
  );
}
