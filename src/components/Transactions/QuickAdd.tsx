import { useState } from 'react';
import { useBudget } from '../../store/budget';
import { createTransaction, ensurePayee, createScheduled, findPayeeByName } from '../../db/repo';
import { todayIso } from '../../domain/date';
import { parseAmountToCents } from '../../domain/calc';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { detectRecurringForPayee } from '../../domain/subscriptions';
import { toast } from '../../lib/toast';
import { PayeeSuggestions } from './PayeeSuggestions';
import { findDuplicateOf } from '../../domain/duplicates';

type Props = {
  accountId?: string;
};

/**
 * Inline add-transaction row. Desktop shows it as a single grid line
 * matching the table columns; mobile compacts it to a sticky drawer
 * triggered by a "+" button.
 */
export function QuickAdd({ accountId }: Props) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const [date, setDate] = useState(todayIso());
  const [payee, setPayee] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [outflow, setOutflow] = useState('');
  const [inflow, setInflow] = useState('');
  const [transferTo, setTransferTo] = useState<string>('');

  const acctOptions = accountId ? null : accounts;
  const [selectedAcct, setSelectedAcct] = useState<string>(accountId ?? accounts[0]?.id ?? '');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const payees = useBudget((s) => s.payees);

  /**
   * When the payee changes, auto-suggest the last-used category for that payee
   * — but only if the user hasn't already picked one (don't overwrite intent).
   */
  function onPayeeChange(name: string) {
    setPayee(name);
    if (categoryId || transferTo) return;
    const trimmed = name.trim().toLowerCase();
    const match = payees.find((p) => p.name.trim().toLowerCase() === trimmed);
    if (match?.defaultCategoryId) setCategoryId(match.defaultCategoryId);
  }

  if (!accountId && !selectedAcct && accounts.length === 0) {
    return (
      <div className="px-3 py-2 text-[12px] text-fg-subtle border-b border-border">
        Add an account first to start recording transactions.
      </div>
    );
  }

  const isTransfer = !!transferTo;

  function reset() {
    setPayee(''); setCategoryId(''); setMemo(''); setOutflow(''); setInflow(''); setTransferTo('');
    setDate(todayIso());
    setMobileExpanded(false);
  }

  function add() {
    const acctId = accountId ?? selectedAcct;
    if (!acctId) return;
    let amount = 0;
    const o = parseAmountToCents(outflow);
    const i = parseAmountToCents(inflow);
    if (o !== null && o !== 0) amount = -Math.abs(o);
    else if (i !== null && i !== 0) amount = Math.abs(i);
    else return;

    // Tier 14 #5 — manual duplicate detection. If a transaction with
    // the same (account, date, amount, payee) already exists, show a
    // confirmation prompt before committing. Skipped for transfers
    // because legitimate scheduled transfers might fire twice on
    // boundary days.
    if (!transferTo && payee.trim()) {
      const allTxns = useBudget.getState().transactions;
      const allPayees = useBudget.getState().payees;
      const matches = findDuplicateOf(
        [{ accountId: acctId, date, payee: payee.trim() || null, categoryId: null, amount }],
        allTxns,
        allPayees,
      );
      const m = matches[0];
      if (m) {
        const existing = allTxns.find((t) => t.id === m.existingId);
        const existingDate = existing?.date ?? '?';
        if (!confirm(
          `Looks like you already added "${payee.trim()}" on ${existingDate} for the same amount in this account. Add anyway?`
        )) {
          return;
        }
      }
    }

    if (transferTo) {
      createTransaction({
        accountId: acctId, date, payee: null,
        categoryId: null,
        transferAccountId: transferTo,
        amount,
      });
    } else {
      if (payee.trim()) ensurePayee(payee);
      createTransaction({
        accountId: acctId, date,
        payee: payee.trim() || null,
        categoryId: categoryId || null,
        amount,
      });
      // Tier 3 #7 — smart-detect: if this payee × this amount has appeared
      // ≥3 times on a regular cadence and there's no scheduled template
      // yet, surface a one-tap "Schedule it?" toast.
      maybeSuggestSchedule(payee, amount, acctId, categoryId, date);
    }
    reset();
  }

  function maybeSuggestSchedule(
    payeeName: string,
    amount: number,
    acctId: string,
    catId: string,
    txnDate: string,
  ) {
    if (!payeeName.trim() || amount === 0) return;
    const p = findPayeeByName(payeeName);
    if (!p) return;
    // Read fresh state for the detector (post-create the new txn is already
    // in the store via Yjs observer; passing the Zustand snapshot is fine).
    const allTxns = useBudget.getState().transactions;
    const allScheduled = useBudget.getState().scheduled;
    const cadence = detectRecurringForPayee(p.id, amount, allTxns, allScheduled);
    if (!cadence) return;
    const dollars = (Math.abs(amount) / 100).toFixed(2);
    const occurrences = allTxns.filter((t) => t.payeeId === p.id && !t.transferAccountId && t.amount < 0).length;
    toast({
      message: `${payeeName} charged $${dollars} — ${occurrences}× on a ${cadence} cadence. Schedule it?`,
      tone: 'info',
      duration: 8000,
      action: {
        label: 'Schedule',
        run: () => {
          createScheduled({
            accountId: acctId,
            payee: payeeName,
            categoryId: catId || null,
            amount,
            frequency: cadence,
            startDate: txnDate,
          });
          toast.success(`${payeeName} scheduled (${cadence})`);
        },
      },
    });
  }

  return (
    <>
      {/* Desktop inline grid */}
      <div className={cn(
        'hidden md:grid grid-cols-[28px_92px_1fr_1fr_1fr_110px_110px_84px] items-center gap-1 px-2 py-1.5 border-b border-border bg-surface-2/30',
      )}>
        <Plus size={14} className="justify-self-center text-fg-subtle" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
        />
        {acctOptions ? (
          <select
            value={selectedAcct}
            onChange={(e) => setSelectedAcct(e.target.value)}
            className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px]"
          >
            {acctOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <input
            list="payees-datalist"
            value={payee}
            onChange={(e) => onPayeeChange(e.target.value)}
            placeholder="Payee"
            className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            disabled={isTransfer}
          />
        )}
        <select
          value={isTransfer ? `__transfer__:${transferTo}` : categoryId}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('__transfer__:')) {
              setTransferTo(v.replace('__transfer__:', ''));
              setCategoryId('');
            } else {
              setTransferTo('');
              setCategoryId(v);
            }
          }}
          className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px]"
        >
          <option value="">— Category —</option>
          <optgroup label="Categories">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Transfer to…">
            {accounts.filter((a) => a.id !== (accountId ?? selectedAcct)).map((a) => (
              <option key={a.id} value={`__transfer__:${a.id}`}>↔ {a.name}</option>
            ))}
          </optgroup>
        </select>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Memo"
          className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-fg"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <input
          value={outflow}
          onChange={(e) => { setOutflow(e.target.value); if (e.target.value) setInflow(''); }}
          placeholder="Outflow"
          inputMode="decimal"
          className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-right tabular text-fg"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <input
          value={inflow}
          onChange={(e) => { setInflow(e.target.value); if (e.target.value) setOutflow(''); }}
          placeholder="Inflow"
          inputMode="decimal"
          className="h-7 px-1 rounded bg-surface-3 border border-border text-[12px] text-right tabular text-fg"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button
          onClick={add}
          className="h-7 rounded bg-accent text-accent-fg text-[12px] font-medium hover:brightness-110 flex items-center justify-center gap-1"
        >
          {isTransfer ? <ArrowLeftRight size={12} /> : <Plus size={12} />} Add
        </button>
      </div>

      {/* Mobile compact toggle */}
      <div className="md:hidden border-b border-border">
        {!mobileExpanded ? (
          <button
            onClick={() => setMobileExpanded(true)}
            className="w-full flex items-center gap-2 px-3 py-3 text-[13px] text-fg-muted active:bg-surface-2/60"
          >
            <Plus size={14} className="text-accent" />
            <span>Add transaction…</span>
          </button>
        ) : (
          <div className="px-3 py-3 space-y-2 bg-surface-2/30">
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-fg flex-1"
              />
              {acctOptions && (
                <select
                  value={selectedAcct}
                  onChange={(e) => setSelectedAcct(e.target.value)}
                  className="h-9 px-2 rounded bg-surface-3 border border-border text-[13px] flex-1"
                >
                  {acctOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
            <input
              list="payees-datalist"
              value={payee}
              onChange={(e) => onPayeeChange(e.target.value)}
              placeholder="Payee"
              className="h-9 w-full px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
              disabled={isTransfer}
            />
            {!isTransfer && (
              <PayeeSuggestions
                query={payee}
                date={date}
                outflowText={outflow}
                inflowText={inflow}
                accountId={accountId ?? selectedAcct}
                onPick={(name, defCat) => {
                  setPayee(name);
                  if (!categoryId && defCat) setCategoryId(defCat);
                }}
              />
            )}
            <select
              value={isTransfer ? `__transfer__:${transferTo}` : categoryId}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('__transfer__:')) { setTransferTo(v.replace('__transfer__:', '')); setCategoryId(''); }
                else { setTransferTo(''); setCategoryId(v); }
              }}
              className="h-9 w-full px-2 rounded bg-surface-3 border border-border text-[13px]"
            >
              <option value="">— Category —</option>
              <optgroup label="Categories">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Transfer to…">
                {accounts.filter((a) => a.id !== (accountId ?? selectedAcct)).map((a) => (
                  <option key={a.id} value={`__transfer__:${a.id}`}>↔ {a.name}</option>
                ))}
              </optgroup>
            </select>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Memo (optional)"
              className="h-9 w-full px-2 rounded bg-surface-3 border border-border text-[13px] text-fg"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={outflow}
                onChange={(e) => { setOutflow(e.target.value); if (e.target.value) setInflow(''); }}
                placeholder="Outflow"
                inputMode="decimal"
                className="h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-right tabular text-fg"
              />
              <input
                value={inflow}
                onChange={(e) => { setInflow(e.target.value); if (e.target.value) setOutflow(''); }}
                placeholder="Inflow"
                inputMode="decimal"
                className="h-9 px-2 rounded bg-surface-3 border border-border text-[13px] text-right tabular text-fg"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { reset(); }}
                className="flex-1 h-10 rounded-lg bg-surface-3 text-fg-muted font-medium text-[13px]"
              >Cancel</button>
              <button
                onClick={add}
                className="flex-1 h-10 rounded-lg bg-accent text-accent-fg font-medium text-[13px] flex items-center justify-center gap-1"
              >
                {isTransfer ? <ArrowLeftRight size={14} /> : <Plus size={14} />}
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
