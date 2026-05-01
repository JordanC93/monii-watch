import { useEffect, useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { TransactionRow } from './TransactionRow';
import { QuickAdd } from './QuickAdd';
import { BulkActionsBar } from './BulkActionsBar';
import { Filter } from 'lucide-react';
import { HelpHint } from '../ui/HelpHint';
import type { Transaction } from '../../domain/types';
import { bulkCreateTransactions } from '../../db/repo';
import { toast } from '../../lib/toast';
import { formatDateShort } from '../../domain/date';

type Props = {
  /** If set, scope transactions to this account. */
  accountId?: string;
  /** Optional outer filter. */
  filter?: (t: Transaction) => boolean;
  /** Show account column on each row (for "All accounts" view) */
  showAccount?: boolean;
};

export function TransactionTable({ accountId, filter, showAccount }: Props) {
  const allTxns = useBudget((s) => s.transactions);
  const [search, setSearch] = useState('');
  const payees = useBudget((s) => s.payees);
  const categories = useBudget((s) => s.categories);
  const accounts = useBudget((s) => s.accounts);
  const selectedIds = useUI((s) => s.selectedTxnIds);
  const setSelectedTxnIds = useUI((s) => s.setSelectedTxnIds);
  const clearSelection = useUI((s) => s.clearTxnSelection);

  // Selection is global state; clear it when the table unmounts so leaving
  // an account page doesn't leave a stale BulkActionsBar pinned to context.
  useEffect(() => () => clearSelection(), [clearSelection]);

  const txns = useMemo(() => {
    let xs = allTxns;
    if (accountId) xs = xs.filter((t) => t.accountId === accountId);
    if (filter) xs = xs.filter(filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((t) => {
        const payee = payees.find((p) => p.id === t.payeeId)?.name ?? '';
        const cat = categories.find((c) => c.id === t.categoryId)?.name ?? '';
        const acct = accounts.find((a) => a.id === t.accountId)?.name ?? '';
        const hay = `${t.date} ${payee} ${cat} ${acct} ${t.memo}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return xs;
  }, [allTxns, accountId, filter, search, payees, categories, accounts]);

  // Tier 12 #8 — running balance per transaction. Only meaningful in
  // single-account view (otherwise the running balance would mix
  // accounts). Computed from the FULL account history (not filtered)
  // so the running balance reflects the account's actual state on
  // each row, not the filter's state.
  const runningBalances = useMemo<Map<string, number>>(() => {
    if (!accountId) return new Map();
    const accountTxns = allTxns.filter((t) => t.accountId === accountId);
    // Ascending by date + createdAt so identical-date entries stay
    // stable. Then accumulate.
    const sorted = [...accountTxns].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
    const map = new Map<string, number>();
    let bal = 0;
    for (const t of sorted) {
      bal += t.amount;
      map.set(t.id, bal);
    }
    return map;
  }, [allTxns, accountId]);

  // Tier 4 #14 — TSV copy/paste. ⌘C copies selected rows as tab-separated
  // values that paste cleanly into Excel / Google Sheets / Numbers. ⌘V on
  // the table accepts TSV → creates transactions via the existing
  // bulk-paste path. Active only when the table has focus and the user
  // isn't typing in a field.
  useEffect(() => {
    function isInField(t: EventTarget | null) {
      if (!t || !(t instanceof HTMLElement)) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as any).isContentEditable;
    }
    function onCopy(e: ClipboardEvent) {
      if (selectedIds.size === 0) return;
      if (isInField(e.target)) return;
      const sel = txns.filter((t) => selectedIds.has(t.id));
      if (sel.length === 0) return;
      const lines = ['Date\tPayee\tCategory\tMemo\tOutflow\tInflow'];
      for (const t of sel) {
        const payee = payees.find((p) => p.id === t.payeeId)?.name ?? '';
        const cat = categories.find((c) => c.id === t.categoryId)?.name ?? '';
        const out = t.amount < 0 ? (-t.amount / 100).toFixed(2) : '';
        const inf = t.amount > 0 ? (t.amount / 100).toFixed(2) : '';
        lines.push([t.date, payee, cat, t.memo, out, inf].map((v) => v.replace(/\t|\n/g, ' ')).join('\t'));
      }
      e.clipboardData?.setData('text/plain', lines.join('\n'));
      e.preventDefault();
      toast.success(`Copied ${sel.length} txn${sel.length === 1 ? '' : 's'} as TSV`);
    }
    function onPaste(e: ClipboardEvent) {
      if (!accountId) return;
      if (isInField(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.includes('\t')) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;
      const startIdx = /^date\b/i.test(lines[0]) ? 1 : 0;
      const inputs = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        const date = cols[0]?.trim();
        const payee = cols[1]?.trim() || null;
        const out = parseFloat((cols[4] ?? '').replace(/[^0-9.\-]/g, '')) || 0;
        const inf = parseFloat((cols[5] ?? '').replace(/[^0-9.\-]/g, '')) || 0;
        const amount = inf > 0 ? Math.round(inf * 100) : out > 0 ? -Math.round(out * 100) : 0;
        if (!date || !amount) continue;
        inputs.push({ accountId, date, payee, categoryId: null, amount });
      }
      if (inputs.length === 0) return;
      e.preventDefault();
      const { created } = bulkCreateTransactions(inputs);
      toast.success(`Pasted ${created} transaction${created === 1 ? '' : 's'} into this account`);
    }
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [txns, selectedIds, payees, categories, accountId]);

  const visibleIds = useMemo(() => txns.map((t) => t.id), [txns]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      // Drop just the visible ones from the selection so a filter narrows correctly.
      const next = new Set(selectedIds);
      for (const id of visibleIds) next.delete(id);
      setSelectedTxnIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of visibleIds) next.add(id);
      setSelectedTxnIds(next);
    }
  }

  return (
    <div className="glass-panel overflow-hidden">
      <BulkActionsBar />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-2/40">
        <Filter size={13} className="text-fg-subtle" />
        <input
          data-search-input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter transactions…"
          className="flex-1 h-7 px-2 rounded bg-transparent text-[12.5px] focus:bg-surface-3 transition-colors"
        />
        <span className="text-[11.5px] text-fg-subtle tabular">{txns.length} {txns.length === 1 ? 'item' : 'items'}</span>
      </div>
      {/* Header — desktop only */}
      <div className="hidden md:grid grid-cols-[24px_28px_92px_1fr_1fr_1fr_110px_110px_84px] items-center gap-1 px-2 py-1.5 text-[11px] uppercase tracking-wider text-fg-subtle border-b border-border bg-surface-2/40">
        <input
          type="checkbox"
          aria-label={allVisibleSelected ? 'Deselect all' : 'Select all'}
          checked={allVisibleSelected}
          ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
          onChange={toggleSelectAll}
          className="justify-self-center accent-accent w-3.5 h-3.5 cursor-pointer"
        />
        <span></span>
        <span>Date</span>
        <span>Payee</span>
        <span>Category</span>
        <span>Memo</span>
        <span className="text-right">Outflow</span>
        <span className="text-right">Inflow</span>
        <span className="text-right pr-1 flex items-center justify-end gap-0.5">
          C
          <HelpHint title="Cleared state" side="bottom">
            Click the circle on a row to cycle:
            <ul className="mt-1 space-y-0.5">
              <li>○ <strong>Uncleared</strong>: pending, not yet at the bank.</li>
              <li>✓ <strong>Cleared</strong>: matches your bank statement.</li>
              <li>✓ <strong>Reconciled</strong> (filled green): frozen as part of a bank reconciliation.</li>
            </ul>
            Use Reconcile (top of the account page) when your statement arrives.
          </HelpHint>
        </span>
      </div>
      <QuickAdd accountId={accountId} />
      <datalist id="payees-datalist">
        {payees.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>
      <div className="max-h-[60vh] sm:max-h-[calc(100vh-280px)] overflow-y-auto">
        {txns.map((t) => (
          <TransactionRow
            key={t.id}
            txn={t}
            showAccount={showAccount}
            runningBalance={runningBalances.get(t.id)}
          />
        ))}
        {txns.length === 0 && (
          <div className="px-4 py-10 text-center text-fg-subtle text-[13px]">
            No transactions yet. Use the row above to add one.
          </div>
        )}
      </div>
    </div>
  );
}
