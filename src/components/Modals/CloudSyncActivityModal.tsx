/**
 * Cloud sync activity log modal (Tier 12 #11/#13).
 *
 * Shows the chronological log of push / pull / merge / rotate /
 * restore events kept by `icloudProvider`. The data lives in
 * localStorage (per-device, not synced) — surfaces here as a
 * troubleshooting tool, not synced state.
 *
 * Each entry shows:
 *   - timestamp
 *   - kind (push / pull / merge / rotate / restore)
 *   - success ✓ / failure ✗
 *   - bytes (when relevant)
 *   - error message (when failed)
 *
 * Filters: All / Pushes / Pulls / Merges / Failures.
 *
 * Filtering by "Failures" is the most useful day-to-day — it's the
 * fastest way to spot an intermittent cloud-storage problem (quota,
 * permission, network) that the inline error banner missed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  CloudUpload, CloudDownload, GitMerge, Archive, RotateCcw,
  Check, X as XIcon, Trash2, ScrollText,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/cn';
import type { ActivityEntry } from '../../sync/icloudProvider';

type Filter = 'all' | 'push' | 'pull' | 'merge' | 'failures';

export function CloudSyncActivityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  // Subscribe to live updates so a push that lands while the modal
  // is open shows up immediately.
  useEffect(() => {
    if (!open) return;
    let unsub: (() => void) | undefined;
    void import('../../sync/icloudProvider').then((m) => {
      unsub = m.onActivity((arr) => setEntries(arr));
    });
    return () => { unsub?.(); };
  }, [open]);

  const filtered = useMemo(() => {
    let out = entries;
    if (filter === 'failures') out = out.filter((e) => !e.ok);
    else if (filter !== 'all') out = out.filter((e) => e.kind === filter);
    // Newest first.
    return [...out].sort((a, b) => b.at - a.at);
  }, [entries, filter]);

  async function clearAll() {
    if (!confirm('Clear the activity log? Doesn\'t affect your synced data, just the local debug history.')) return;
    const m = await import('../../sync/icloudProvider');
    m.clearActivityLog();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><ScrollText size={14} className="text-accent" /> Cloud sync activity</span>}
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={clearAll} disabled={entries.length === 0}>
            <Trash2 size={13} /> Clear log
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-fg-muted text-[12.5px] leading-relaxed">
          Chronological log of every push / pull / merge for this
          device. Stored locally; not synced across devices. Last
          100 events.
        </p>

        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {([
            { id: 'all', label: 'All' },
            { id: 'push', label: 'Pushes' },
            { id: 'pull', label: 'Pulls' },
            { id: 'merge', label: 'Merges' },
            { id: 'failures', label: 'Failures' },
          ] as Array<{ id: Filter; label: string }>).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-2 py-0.5 rounded-full border',
                filter === f.id
                  ? 'bg-accent text-accent-fg border-accent'
                  : 'border-border text-fg-muted hover:text-fg',
              )}
            >{f.label}</button>
          ))}
          <span className="text-fg-subtle ml-auto">{filtered.length} of {entries.length}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-fg-subtle text-center py-8">
            {entries.length === 0
              ? 'No activity recorded yet. Once you enable Cloud folder sync, push and pull events will land here.'
              : 'No matching entries. Try a different filter.'}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
            {filtered.map((e, i) => (
              <ActivityRow key={`${e.at}-${i}`} entry={e} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const Icon =
    entry.kind === 'push' ? CloudUpload :
    entry.kind === 'pull' ? CloudDownload :
    entry.kind === 'merge' ? GitMerge :
    entry.kind === 'rotate' ? Archive :
    RotateCcw;
  const verb =
    entry.kind === 'push' ? 'Pushed' :
    entry.kind === 'pull' ? 'Pulled' :
    entry.kind === 'merge' ? 'Merged from cloud' :
    entry.kind === 'rotate' ? 'Rotated previous snapshot' :
    'Restored previous snapshot';
  return (
    <div className="px-3 py-2 flex items-start gap-3">
      <span
        className={cn(
          'flex-shrink-0 w-6 h-6 rounded-full grid place-items-center mt-0.5',
          entry.ok ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative',
        )}
        title={entry.ok ? 'Success' : 'Failed'}
      >
        {entry.ok ? <Check size={12} /> : <XIcon size={12} />}
      </span>
      <Icon size={14} className="text-fg-subtle mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px]">
          <span className="font-medium">{verb}</span>
          {entry.bytes !== undefined && (
            <span className="text-fg-subtle ml-1.5 tabular text-[11.5px]">
              · {formatBytes(entry.bytes)}
            </span>
          )}
          {entry.mergedStructs !== undefined && (
            <span className="text-fg-subtle ml-1.5 tabular text-[11.5px]">
              · ~{entry.mergedStructs} bytes of new changes
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-fg-subtle tabular">
          {format(new Date(entry.at), 'MMM d, h:mm:ss a')} · {formatDistanceToNow(entry.at, { addSuffix: true })}
        </div>
        {entry.error && (
          <div className="text-[11.5px] text-negative mt-0.5 break-words">
            {entry.error}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
