/**
 * Search page (rebuilt v0.6.2).
 *
 * Multi-faceted filters with quick-pick chips, relative-date pills,
 * type filter (transfer/income/expense/refund), has-X tags, and a
 * CSV export of the result set. Free-text search includes OCR'd
 * receipt text by default.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark, Plus, Trash2, X, Filter, Download, Calendar, Tag, Receipt,
  Flag, AlertCircle, Search as SearchIcon, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
} from 'lucide-react';
import { useBudget } from '../store/budget';
import { createSavedSearch, deleteSavedSearch } from '../db/repo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useFormatMoney } from '../lib/format';
import { parseAmountToCents } from '../domain/calc';
import { cn } from '../lib/cn';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { todayIso, isoAddDays } from '../domain/date';
import { detectAnomalies } from '../domain/anomaly';
import type { SavedSearch, Transaction } from '../domain/types';
import { Link } from 'react-router-dom';

type TxnType = 'all' | 'income' | 'expense' | 'transfer' | 'refund';

type ActiveFilter = {
  query?: string;
  categoryIds?: string[];
  accountIds?: string[];
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: TxnType;
  hasFlag?: boolean;
  hasReceipt?: boolean;
  uncategorized?: boolean;
  isAnomaly?: boolean;
};

const QUICK_CHIPS: Array<{ id: string; label: string; build: () => ActiveFilter }> = [
  { id: 'last-7', label: 'Last 7 days', build: () => ({ dateFrom: isoAddDays(todayIso(), -7), dateTo: todayIso() }) },
  { id: 'last-30', label: 'Last 30 days', build: () => ({ dateFrom: isoAddDays(todayIso(), -30), dateTo: todayIso() }) },
  { id: 'this-month', label: 'This month', build: () => ({ dateFrom: todayIso().slice(0, 7) + '-01', dateTo: todayIso() }) },
  { id: 'last-month', label: 'Last month', build: () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { dateFrom: fmt(start), dateTo: fmt(end) };
  } },
  { id: 'this-year', label: 'This year', build: () => ({ dateFrom: todayIso().slice(0, 4) + '-01-01', dateTo: todayIso() }) },
  { id: 'uncategorized', label: 'Uncategorized', build: () => ({ uncategorized: true }) },
  { id: 'has-flag', label: 'Flagged', build: () => ({ hasFlag: true }) },
  { id: 'has-receipt', label: 'Has receipt', build: () => ({ hasReceipt: true }) },
];

export function SearchPage() {
  const saved = useBudget((s) => s.savedSearches);
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();

  const [filter, setFilter] = useState<ActiveFilter>({});
  const [showFilterEditor, setShowFilterEditor] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [amountMinText, setAmountMinText] = useState('');
  const [amountMaxText, setAmountMaxText] = useState('');

  // Listen for ?payee=... in the URL — used by "find similar" navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get('payee');
    if (p) {
      setFilter((f) => ({ ...f, query: p }));
    }
  }, []);

  // Anomaly txn ids (set, lookups O(1)).
  const anomalyIds = useMemo(() => {
    const out = new Set<string>();
    for (const a of detectAnomalies(txns)) out.add(a.txnId);
    return out;
  }, [txns]);

  function applySaved(s: SavedSearch) {
    setFilter({
      query: s.query,
      categoryIds: s.categoryId ? [s.categoryId] : undefined,
      accountIds: s.accountId ? [s.accountId] : undefined,
      amountMin: s.amountMin,
      amountMax: s.amountMax,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
    });
    setAmountMinText(s.amountMin ? (s.amountMin / 100).toString() : '');
    setAmountMaxText(s.amountMax ? (s.amountMax / 100).toString() : '');
    setShowFilterEditor(true);
  }

  function saveCurrent() {
    if (!saveName.trim()) return;
    createSavedSearch({
      name: saveName.trim(),
      query: filter.query,
      categoryId: filter.categoryIds?.[0],
      accountId: filter.accountIds?.[0],
      amountMin: filter.amountMin,
      amountMax: filter.amountMax,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    setSaveName('');
    setSavePromptOpen(false);
  }

  // Push min/max input into filter when text changes.
  useEffect(() => {
    const min = parseAmountToCents(amountMinText);
    const max = parseAmountToCents(amountMaxText);
    setFilter((f) => ({ ...f, amountMin: min ?? undefined, amountMax: max ?? undefined }));
  }, [amountMinText, amountMaxText]);

  // Apply the filter.
  const filteredTxns = useMemo(() => {
    const q = filter.query?.toLowerCase().trim();
    return txns.filter((t) => {
      if (q) {
        const payeeName = t.payeeId ? payees.find((p) => p.id === t.payeeId)?.name : '';
        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name : '';
        const acct = accounts.find((a) => a.id === t.accountId)?.name ?? '';
        const hay = `${payeeName ?? ''} ${cat ?? ''} ${acct} ${t.memo ?? ''} ${t.receiptText ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter.categoryIds && filter.categoryIds.length > 0 && (!t.categoryId || !filter.categoryIds.includes(t.categoryId))) return false;
      if (filter.accountIds && filter.accountIds.length > 0 && !filter.accountIds.includes(t.accountId)) return false;
      if (filter.uncategorized && t.categoryId) return false;
      const abs = Math.abs(t.amount);
      if (filter.amountMin !== undefined && abs < filter.amountMin) return false;
      if (filter.amountMax !== undefined && abs > filter.amountMax) return false;
      if (filter.dateFrom && t.date < filter.dateFrom) return false;
      if (filter.dateTo && t.date > filter.dateTo) return false;
      if (filter.type && filter.type !== 'all') {
        if (filter.type === 'transfer' && !t.transferAccountId) return false;
        if (filter.type === 'income' && (t.amount <= 0 || t.transferAccountId)) return false;
        if (filter.type === 'expense' && (t.amount >= 0 || t.transferAccountId)) return false;
        if (filter.type === 'refund' && (t.amount <= 0 || !t.expectedRefund?.received)) return false;
      }
      if (filter.hasFlag && !t.flag) return false;
      if (filter.hasReceipt && !t.receiptImageDataUrl) return false;
      if (filter.isAnomaly && !anomalyIds.has(t.id)) return false;
      return true;
    });
  }, [txns, filter, payees, categories, accounts, anomalyIds]);

  const hasFilter = useMemo(() => {
    const v = filter;
    return !!(v.query || (v.categoryIds && v.categoryIds.length > 0) || (v.accountIds && v.accountIds.length > 0)
      || v.amountMin !== undefined || v.amountMax !== undefined
      || v.dateFrom || v.dateTo || (v.type && v.type !== 'all') || v.hasFlag || v.hasReceipt
      || v.uncategorized || v.isAnomaly);
  }, [filter]);

  function clearAll() {
    setFilter({});
    setAmountMinText('');
    setAmountMaxText('');
  }

  function exportCsv() {
    const rows = filteredTxns.map((t) => {
      const account = accounts.find((a) => a.id === t.accountId)?.name ?? '';
      const category = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name ?? '' : '';
      const payee = t.payeeId ? payees.find((p) => p.id === t.payeeId)?.name ?? '' : '';
      const transferTo = t.transferAccountId ? accounts.find((a) => a.id === t.transferAccountId)?.name ?? '' : '';
      return [
        t.date,
        account,
        payee,
        category,
        transferTo,
        (t.amount / 100).toFixed(2),
        t.cleared,
        t.flag ?? '',
        t.memo ?? '',
      ];
    });
    const header = ['Date', 'Account', 'Payee', 'Category', 'Transfer To', 'Amount', 'Cleared', 'Flag', 'Memo'];
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `monii-search-${todayIso()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applyChip(c: typeof QUICK_CHIPS[number]) {
    const next = c.build();
    setFilter((f) => ({ ...f, ...next }));
    if (next.dateFrom !== undefined) {
      // Force editor open so user sees the active filter
      setShowFilterEditor(true);
    }
  }

  const total = filteredTxns.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0);
  const inflowTotal = filteredTxns.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0);

  return (
    <div className="max-w-7xl mx-auto">
      <MobilePageHeader
        title="Search"
        subtitle={`${hasFilter ? filteredTxns.length : txns.length} transaction${(hasFilter ? filteredTxns.length : txns.length) === 1 ? '' : 's'}${hasFilter ? ` · ${fmt(total)} spent · ${fmt(inflowTotal)} in` : ''}`}
      />

      <div className="p-3 sm:p-5 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            value={filter.query ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search payee, memo, OCR receipt text…"
            data-search-input
            aria-label="Search transactions"
            className="pl-9 text-[13px]"
          />
        </div>

        {/* Quick-filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => applyChip(c)}
              className="px-2.5 py-1 rounded-full border border-border bg-surface-2/40 text-[11.5px] hover:bg-surface-2 text-fg-muted hover:text-fg"
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Type filter row */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11.5px]">
          <span className="text-fg-subtle">Type:</span>
          {([
            { id: 'all', label: 'All', icon: null },
            { id: 'expense', label: 'Expenses', icon: <ArrowUpRight size={11} /> },
            { id: 'income', label: 'Income', icon: <ArrowDownLeft size={11} /> },
            { id: 'transfer', label: 'Transfers', icon: <ArrowLeftRight size={11} /> },
          ] as Array<{ id: TxnType; label: string; icon: React.ReactNode }>).map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter((f) => ({ ...f, type: t.id === 'all' ? undefined : t.id }))}
              aria-pressed={(filter.type ?? 'all') === t.id}
              className={cn(
                'px-2 py-0.5 rounded inline-flex items-center gap-1',
                (filter.type ?? 'all') === t.id ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Saved-search chip strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <Bookmark size={13} className="text-accent flex-shrink-0" />
          {saved.length === 0 && (
            <span className="text-[12px] text-fg-subtle">No saved searches yet.</span>
          )}
          {saved.map((s) => (
            <button
              key={s.id}
              onClick={() => applySaved(s)}
              className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-2/40 text-[12px] hover:bg-surface-2"
            >
              <span>{s.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete saved search "${s.name}"?`)) deleteSavedSearch(s.id); }}
                className="text-fg-subtle hover:text-negative opacity-0 group-hover:opacity-100"
                aria-label="Delete saved search"
              >
                <Trash2 size={10} />
              </span>
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setShowFilterEditor((v) => !v)}>
            <Filter size={12} /> Advanced
          </Button>
          {hasFilter && (
            <>
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <X size={12} /> Clear
              </Button>
              <Button size="sm" variant="ghost" onClick={exportCsv} aria-label="Export filtered results to CSV">
                <Download size={12} /> CSV
              </Button>
            </>
          )}
        </div>

        {showFilterEditor && (
          <div className="glass-panel p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Select
                value={filter.categoryIds?.[0] ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, categoryIds: e.target.value ? [e.target.value] : undefined }))}
                className="text-[12.5px]"
              >
                <option value="">— Any category —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select
                value={filter.accountIds?.[0] ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, accountIds: e.target.value ? [e.target.value] : undefined }))}
                className="text-[12.5px]"
              >
                <option value="">— Any account —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-1">
                <Input value={amountMinText} onChange={(e) => setAmountMinText(e.target.value)} placeholder="≥ $" inputMode="decimal" className="text-[12px] text-right tabular" aria-label="Minimum amount" />
                <Input value={amountMaxText} onChange={(e) => setAmountMaxText(e.target.value)} placeholder="≤ $" inputMode="decimal" className="text-[12px] text-right tabular" aria-label="Maximum amount" />
              </div>
              <Input type="date" value={filter.dateFrom ?? ''} onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value || undefined }))} className="text-[12.5px]" aria-label="From date" />
              <Input type="date" value={filter.dateTo ?? ''} onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value || undefined }))} className="text-[12.5px]" aria-label="To date" />
            </div>

            {/* Toggle filters */}
            <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
              <ToggleChip on={!!filter.hasFlag} onChange={(v) => setFilter((f) => ({ ...f, hasFlag: v || undefined }))} icon={<Flag size={11} />}>Has flag</ToggleChip>
              <ToggleChip on={!!filter.hasReceipt} onChange={(v) => setFilter((f) => ({ ...f, hasReceipt: v || undefined }))} icon={<Receipt size={11} />}>Has receipt</ToggleChip>
              <ToggleChip on={!!filter.uncategorized} onChange={(v) => setFilter((f) => ({ ...f, uncategorized: v || undefined }))} icon={<Tag size={11} />}>Uncategorized</ToggleChip>
              <ToggleChip on={!!filter.isAnomaly} onChange={(v) => setFilter((f) => ({ ...f, isAnomaly: v || undefined }))} icon={<AlertCircle size={11} />}>Unusual</ToggleChip>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11.5px] text-fg-subtle">
                Showing <strong className="text-fg">{filteredTxns.length}</strong> of {txns.length} ({fmt(total)} spent · {fmt(inflowTotal)} income)
              </div>
              <Button size="sm" variant="primary" onClick={() => setSavePromptOpen(true)} disabled={!hasFilter}>
                <Bookmark size={12} /> Save as…
              </Button>
            </div>

            {savePromptOpen && (
              <div className="flex items-center gap-2 mt-1">
                <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this filter" className="flex-1" autoFocus />
                <Button variant="primary" onClick={saveCurrent} disabled={!saveName.trim()}>Save</Button>
                <Button variant="ghost" onClick={() => setSavePromptOpen(false)}>Cancel</Button>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {hasFilter ? (
          <FilteredList list={filteredTxns} />
        ) : (
          <div className="text-[12px] text-fg-subtle italic">
            Enter text or pick a quick filter to start searching.
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleChip({ on, onChange, children, icon }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border',
        on ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2/40 text-fg-muted border-border hover:text-fg',
      )}
    >
      {icon}{children}
    </button>
  );
}

function FilteredList({ list }: { list: Transaction[] }) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  if (list.length === 0) {
    return <div className="glass-panel p-6 text-[12.5px] text-fg-subtle text-center">No matches. Adjust filters above.</div>;
  }
  return (
    <div className="glass-panel p-2">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle px-2 py-1.5 border-b border-border/50">
        {list.length} match{list.length === 1 ? '' : 'es'}
      </div>
      <div className="divide-y divide-border/40">
        {list.map((t) => {
          const acct = accounts.find((a) => a.id === t.accountId);
          const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
          const payee = t.payeeId ? payees.find((p) => p.id === t.payeeId) : null;
          return (
            <Link
              key={t.id}
              to={`/accounts/${t.accountId}`}
              className="grid grid-cols-[80px_1fr_auto] gap-2 py-2 px-2 items-center hover:bg-surface-2/30 rounded"
            >
              <div className="text-[11.5px] text-fg-subtle tabular">{t.date}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                  {payee?.name ?? '—'}
                  {t.flag && <span className={cn('w-2 h-2 rounded-full', `bg-${t.flag === 'red' ? 'negative' : t.flag === 'green' ? 'positive' : t.flag === 'orange' ? 'warning' : 'accent'}`)} aria-label={`Flagged ${t.flag}`} />}
                  {t.receiptImageDataUrl && <Receipt size={10} className="text-fg-subtle" aria-label="Has receipt" />}
                </div>
                <div className="text-[11px] text-fg-subtle truncate">
                  {cat?.name ?? 'Uncategorized'} · {acct?.name ?? '?'}{t.memo ? ` · ${t.memo}` : ''}
                </div>
              </div>
              <div className={cn('text-right tabular text-[13px]', t.amount > 0 ? 'text-positive' : 'text-fg')}>
                {fmt(t.amount)}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
