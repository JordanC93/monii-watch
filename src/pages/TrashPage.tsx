/**
 * Trash page (Tier 11 #1). Lists soft-deleted entries with restore +
 * permanent-purge actions. Auto-purged at 30 days by main.tsx.
 *
 * The trash itself is a synced Yjs map (`MAPS.trash`) — restoring
 * one device's deleted record from another is by design.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trash2, RotateCcw, AlertTriangle, ArrowLeft, Briefcase, Wallet,
  ListChecks, CalendarClock, Folder,
} from 'lucide-react';
import { useBudget } from '../store/budget';
import { listTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from '../db/repo';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { toast } from '../lib/toast';
import { format, formatDistanceToNow } from 'date-fns';
import type { TrashEntry } from '../domain/types';

export function TrashPage() {
  const nav = useNavigate();
  // Subscribe to the trash map via the existing Zustand mirror — when
  // it's not yet wired, fall back to a direct read.
  const trashFromStore = useBudget((s) => (s as unknown as { trash?: TrashEntry[] }).trash);
  // The store doesn't expose `trash` yet (we add the mirror below);
  // until then, read from repo on every render. Cheap.
  const entries = useMemo(() => trashFromStore ?? listTrash(), [trashFromStore]);

  const [filter, setFilter] = useState<TrashEntry['kind'] | 'all'>('all');
  const filtered = useMemo(
    () => filter === 'all' ? entries : entries.filter((e) => e.kind === filter),
    [entries, filter],
  );

  function handleRestore(e: TrashEntry) {
    const ok = restoreFromTrash(e.id);
    if (ok) {
      toast.success(`Restored ${e.description}`);
    } else {
      toast.error(`Couldn't fully restore ${e.description}. Some references are missing.`);
    }
  }

  function handlePurge(e: TrashEntry) {
    if (!confirm(`Permanently delete "${e.description}"? This cannot be undone.`)) return;
    purgeTrashEntry(e.id);
    toast.info(`Purged "${e.description}".`);
  }

  function handleEmptyAll() {
    if (entries.length === 0) return;
    if (!confirm(`Permanently delete all ${entries.length} entries? This cannot be undone.`)) return;
    emptyTrash();
    toast.info('Trash emptied.');
  }

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Trash"
        subtitle={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · 30-day retention`}
      />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => nav(-1)}>
            <ArrowLeft size={13} /> Back
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="danger" onClick={handleEmptyAll} disabled={entries.length === 0}>
              <Trash2 size={13} /> Empty trash
            </Button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {(['all', 'account', 'category', 'group', 'transaction', 'scheduled'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                'px-2 py-0.5 rounded-full border '
                + (filter === k
                  ? 'bg-accent text-accent-fg border-accent'
                  : 'border-border text-fg-muted hover:text-fg')
              }
            >
              {k === 'all' ? 'All' : k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <div className="text-[14px] font-medium mb-1">Nothing in the trash.</div>
            <div className="text-[12px] text-fg-subtle">
              Deleted accounts, categories, transactions, and scheduled entries
              live here for 30 days before permanent removal.
            </div>
          </div>
        ) : (
          <div className="glass-panel divide-y divide-border/60">
            {filtered.map((e) => {
              const Icon = iconFor(e.kind);
              const expiresIn = (e.deletedAt + 30 * 86400 * 1000) - Date.now();
              const expiresSoon = expiresIn < 7 * 86400 * 1000;
              return (
                <div key={e.id} className="p-3 flex flex-wrap items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-surface-2 grid place-items-center flex-shrink-0">
                    <Icon size={14} className="text-fg-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{e.description}</div>
                    <div className="text-[11px] text-fg-subtle mt-0.5">
                      Deleted {format(new Date(e.deletedAt), 'MMM d, yyyy h:mm a')} ·{' '}
                      {formatDistanceToNow(new Date(e.deletedAt), { addSuffix: true })}
                    </div>
                    {expiresSoon && (
                      <div className="text-[11px] text-warning mt-0.5 flex items-center gap-1">
                        <AlertTriangle size={11} /> Auto-purges in {Math.max(1, Math.ceil(expiresIn / 86400000))} day{Math.ceil(expiresIn / 86400000) === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => handleRestore(e)}>
                      <RotateCcw size={12} /> Restore
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handlePurge(e)}>
                      <Trash2 size={12} /> Purge
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(kind: TrashEntry['kind']) {
  switch (kind) {
    case 'account': return Wallet;
    case 'category': return ListChecks;
    case 'group': return Folder;
    case 'transaction': return Briefcase;
    case 'scheduled': return CalendarClock;
  }
}
