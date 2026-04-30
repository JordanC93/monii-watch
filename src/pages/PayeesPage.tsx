/**
 * Payees management page (Tier 7 #3).
 *
 * Lists every payee with its transaction count + total spend. Supports
 * bulk merge: select 2+ payees, pick which to keep, hit Merge.
 *
 * Also surfaces "likely-same-vendor" suggestions — pairs whose names
 * differ only by trailing identifiers (e.g. "Starbucks" vs "STARBUCKS
 * STORE #5821").
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../store/budget';
import { mergePayees, deletePayee } from '../db/repo';
import { useFormatMoney } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Merge, Search, Trash2, Lightbulb } from 'lucide-react';
import { toast } from '../lib/toast';

export function PayeesPage() {
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState<string | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; total: number; lastDate: string }>();
    for (const t of txns) {
      if (!t.payeeId) continue;
      if (t.transferAccountId) continue;
      const cur = m.get(t.payeeId) ?? { count: 0, total: 0, lastDate: '' };
      cur.count += 1;
      cur.total += t.amount;
      if (t.date > cur.lastDate) cur.lastDate = t.date;
      m.set(t.payeeId, cur);
    }
    return m;
  }, [txns]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return payees
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
      .map((p) => ({
        payee: p,
        ...(stats.get(p.id) ?? { count: 0, total: 0, lastDate: '' }),
      }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [payees, stats, filter]);

  const suggestions = useMemo(() => {
    return suggestSimilarPayees(payees);
  }, [payees]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (!next.has(keep ?? '')) setKeep(null);
  }
  function clearSelection() {
    setSelected(new Set());
    setKeep(null);
  }

  function commitMerge() {
    if (!keep || selected.size < 2) return;
    const sources = Array.from(selected).filter((id) => id !== keep);
    const targetName = payees.find((p) => p.id === keep)?.name ?? '';
    if (!confirm(`Merge ${sources.length} payee${sources.length === 1 ? '' : 's'} into "${targetName}"?\nAll matching transactions will be re-pointed.`)) return;
    const r = mergePayees(keep, sources);
    toast.success(`Merged ${r.merged} payee${r.merged === 1 ? '' : 's'} · ${r.updatedTxns} txns updated`);
    clearSelection();
  }

  function applySuggestion(targetId: string, sourceIds: string[]) {
    const r = mergePayees(targetId, sourceIds);
    toast.success(`Merged ${r.merged} payee${r.merged === 1 ? '' : 's'}`);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <MobilePageHeader title="Payees" subtitle={`${payees.length} payee${payees.length === 1 ? '' : 's'}`} />

      <div className="p-3 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-fg-subtle" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter payees…"
            className="flex-1"
          />
        </div>

        {suggestions.length > 0 && (
          <div className="glass-panel p-3 sm:p-4 ring-1 ring-accent/30">
            <div className="text-[12.5px] font-semibold flex items-center gap-1.5 mb-2">
              <Lightbulb size={13} className="text-accent" /> Suggested merges
            </div>
            <div className="space-y-1.5">
              {suggestions.slice(0, 6).map((s, i) => {
                const target = payees.find((p) => p.id === s.targetId);
                if (!target) return null;
                return (
                  <div key={i} className="flex items-center gap-2 text-[12px] py-1 border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">→ {target.name}</div>
                      <div className="text-[11px] text-fg-subtle truncate">
                        {s.sourceIds.map((sid) => payees.find((p) => p.id === sid)?.name).filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      onClick={() => applySuggestion(s.targetId, s.sourceIds)}
                      className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[11.5px] hover:bg-accent/20"
                    >
                      Merge
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selected.size >= 2 && (
          <div className="sticky top-0 z-10 glass-panel ring-1 ring-accent/40 p-3 flex items-center gap-2 flex-wrap">
            <span className="text-[12px]">{selected.size} selected · keep:</span>
            <select
              value={keep ?? ''}
              onChange={(e) => setKeep(e.target.value || null)}
              className="text-[12px] bg-surface-2 border border-border rounded px-2 py-1"
            >
              <option value="">— pick a payee —</option>
              {Array.from(selected).map((id) => {
                const p = payees.find((x) => x.id === id);
                return p ? <option key={id} value={id}>{p.name}</option> : null;
              })}
            </select>
            <div className="flex-1" />
            <Button size="sm" onClick={commitMerge} disabled={!keep}>
              <Merge size={13} /> Merge
            </Button>
            <Button size="sm" variant="secondary" onClick={clearSelection}>Cancel</Button>
          </div>
        )}

        <div className="glass-panel p-2 sm:p-3">
          <div className="grid grid-cols-[24px_1fr_70px_70px_28px] gap-2 px-1.5 py-1 text-[10.5px] uppercase tracking-wider text-fg-subtle border-b border-border">
            <div></div>
            <div>Payee</div>
            <div className="text-right">Txns</div>
            <div className="text-right">Spent</div>
            <div></div>
          </div>
          {visible.map(({ payee, count, total }) => (
            <div
              key={payee.id}
              className="grid grid-cols-[24px_1fr_70px_70px_28px] gap-2 px-1.5 py-1.5 text-[12px] items-center hover:bg-surface-2/30 border-b border-border/50 last:border-0"
            >
              <input
                type="checkbox"
                checked={selected.has(payee.id)}
                onChange={() => toggle(payee.id)}
                className="accent-accent"
                aria-label={`Select ${payee.name}`}
              />
              <div className="font-medium truncate">{payee.name}</div>
              <div className="tabular text-right text-fg-subtle">{count}</div>
              <div className="tabular text-right">{fmt(total)}</div>
              <button
                onClick={() => {
                  if (count > 0) {
                    if (!confirm(`Delete payee "${payee.name}"?\n${count} transactions will become unassigned.`)) return;
                  }
                  deletePayee(payee.id);
                }}
                className="text-fg-subtle hover:text-negative p-1 rounded"
                aria-label={`Delete ${payee.name}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="text-[12px] text-fg-subtle text-center py-4">
              No payees match.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Suggest which payees look like canonical-form variants. Heuristic
 * rules:
 *   - Strip trailing store numbers (#1234, store #1234)
 *   - Strip trailing city/state codes
 *   - Group by canonical-form key
 *   - Pick the SHORTEST name as the target
 */
function suggestSimilarPayees(payees: Array<{ id: string; name: string }>): Array<{ targetId: string; sourceIds: string[] }> {
  const groups = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of payees) {
    const key = canonicalize(p.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const out: Array<{ targetId: string; sourceIds: string[] }> = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.name.length - b.name.length);
    const target = sorted[0];
    const sources = sorted.slice(1).map((p) => p.id);
    out.push({ targetId: target.id, sourceIds: sources });
  }
  return out.sort((a, b) => b.sourceIds.length - a.sourceIds.length);
}

function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/store\s*#?\s*\d+/g, '')        // "store #1234"
    .replace(/#\s*\d+/g, '')                  // "#1234"
    .replace(/\b\d{3,}\b/g, '')               // standalone numbers
    .replace(/\b[a-z]{2,3}\d+\b/g, '')        // "tx123"
    .replace(/\s+(in|at)\s+[a-z\s]+$/g, '')   // "at austin tx"
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
