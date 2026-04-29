/**
 * Search page — full transaction list + a saved-searches strip at the top.
 *
 * Each saved search is a tiny chip that re-applies its filter when
 * tapped. Power users can pin "all dining > $50 in 90 days" or "any
 * Visa charge in March" and recall it with one click.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Plus, Trash2, X } from 'lucide-react';
import { TransactionTable } from '../components/Transactions/TransactionTable';
import { useBudget } from '../store/budget';
import { createSavedSearch, deleteSavedSearch } from '../db/repo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useFormatMoney } from '../lib/format';
import { parseAmountToCents } from '../domain/calc';
import { cn } from '../lib/cn';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import type { SavedSearch } from '../domain/types';

type ActiveFilter = Partial<Pick<SavedSearch, 'query' | 'categoryId' | 'accountId' | 'amountMin' | 'amountMax' | 'dateFrom' | 'dateTo'>>;

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

  function applySaved(s: SavedSearch) {
    setFilter({
      query: s.query,
      categoryId: s.categoryId,
      accountId: s.accountId,
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
    createSavedSearch({ name: saveName.trim(), ...filter });
    setSaveName('');
    setSavePromptOpen(false);
  }

  // Apply the filter — returns the IDs that pass.
  const passIds = useMemo(() => {
    const results = new Set<string>();
    const q = filter.query?.toLowerCase().trim();
    for (const t of txns) {
      if (q) {
        const payeeName = t.payeeId ? payees.find((p) => p.id === t.payeeId)?.name : '';
        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name : '';
        const hay = `${payeeName ?? ''} ${cat ?? ''} ${t.memo ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (filter.categoryId && t.categoryId !== filter.categoryId) continue;
      if (filter.accountId && t.accountId !== filter.accountId) continue;
      const abs = Math.abs(t.amount);
      if (filter.amountMin !== undefined && abs < filter.amountMin) continue;
      if (filter.amountMax !== undefined && abs > filter.amountMax) continue;
      if (filter.dateFrom && t.date < filter.dateFrom) continue;
      if (filter.dateTo && t.date > filter.dateTo) continue;
      results.add(t.id);
    }
    return results;
  }, [txns, filter, payees, categories]);

  // Push min/max input into filter when text changes.
  useEffect(() => {
    const min = parseAmountToCents(amountMinText);
    const max = parseAmountToCents(amountMaxText);
    setFilter((f) => ({ ...f, amountMin: min ?? undefined, amountMax: max ?? undefined }));
  }, [amountMinText, amountMaxText]);

  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== '');
  const filteredTxns = txns.filter((t) => passIds.has(t.id));

  return (
    <div className="max-w-7xl mx-auto">
      <MobilePageHeader title="Search" subtitle={`${hasFilter ? filteredTxns.length : txns.length} transactions`} />
      <div className="p-3 sm:p-5 space-y-3">
        {/* Saved-search chip strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <Bookmark size={13} className="text-accent flex-shrink-0" />
          {saved.length === 0 && (
            <span className="text-[12px] text-fg-subtle">No saved searches yet — build a filter and save it.</span>
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
            <Plus size={12} /> Filters
          </Button>
          {hasFilter && (
            <Button size="sm" variant="ghost" onClick={() => { setFilter({}); setAmountMinText(''); setAmountMaxText(''); }}>
              <X size={12} /> Clear
            </Button>
          )}
        </div>

        {showFilterEditor && (
          <div className="glass-panel p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Input
                value={filter.query ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                placeholder="Text in payee / memo"
                className="text-[12.5px]"
              />
              <Select value={filter.categoryId ?? ''} onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value || undefined }))} className="text-[12.5px]">
                <option value="">— Any category —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={filter.accountId ?? ''} onChange={(e) => setFilter((f) => ({ ...f, accountId: e.target.value || undefined }))} className="text-[12.5px]">
                <option value="">— Any account —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-1">
                <Input value={amountMinText} onChange={(e) => setAmountMinText(e.target.value)} placeholder="≥ $" inputMode="decimal" className="text-[12px] text-right tabular" />
                <Input value={amountMaxText} onChange={(e) => setAmountMaxText(e.target.value)} placeholder="≤ $" inputMode="decimal" className="text-[12px] text-right tabular" />
              </div>
              <Input type="date" value={filter.dateFrom ?? ''} onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value || undefined }))} className="text-[12.5px]" />
              <Input type="date" value={filter.dateTo ?? ''} onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value || undefined }))} className="text-[12.5px]" />
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11.5px] text-fg-subtle">
                Showing <strong className="text-fg">{filteredTxns.length}</strong> of {txns.length} ({fmt(filteredTxns.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0))} total spent)
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

        {hasFilter ? (
          <div className="glass-panel p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-2">{filteredTxns.length} match{filteredTxns.length === 1 ? '' : 'es'}</div>
            <FilteredList ids={passIds} />
          </div>
        ) : (
          <TransactionTable showAccount />
        )}
      </div>
    </div>
  );
}

function FilteredList({ ids }: { ids: Set<string> }) {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const list = txns.filter((t) => ids.has(t.id));
  if (list.length === 0) return <div className="text-[12.5px] text-fg-subtle text-center py-6">No matches.</div>;
  return (
    <div className="divide-y divide-border/40">
      {list.map((t) => {
        const acct = accounts.find((a) => a.id === t.accountId);
        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
        const payee = t.payeeId ? payees.find((p) => p.id === t.payeeId) : null;
        return (
          <div key={t.id} className="grid grid-cols-[80px_1fr_auto] gap-2 py-2 items-center">
            <div className="text-[11.5px] text-fg-subtle tabular">{t.date}</div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">{payee?.name ?? '—'}</div>
              <div className="text-[11px] text-fg-subtle truncate">{cat?.name ?? 'Uncategorized'} · {acct?.name ?? '?'}{t.memo ? ` · ${t.memo}` : ''}</div>
            </div>
            <div className={cn('text-right tabular text-[13px]', t.amount > 0 ? 'text-positive' : 'text-fg')}>
              {fmt(t.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
