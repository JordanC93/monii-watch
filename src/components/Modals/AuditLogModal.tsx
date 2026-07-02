/**
 * Unified audit log modal (Tier 10 #8).
 *
 * Merges the two sources:
 *   - `Settings.chatAuditLog`   — chat-driven mutations
 *   - `Settings.auditLog`       — direct edits (rename / delete /
 *                                  recategorize / scheduled changes /
 *                                  imports). Captured by `appendAudit`
 *                                  in `db/repo.ts`.
 *
 * Each source is FIFO-pruned independently (chat at 200, direct at
 * 500). The display sorts newest first across both. Filters by source
 * + by kind (create/update/delete/import).
 *
 * The `chatAuditLog` modal is kept as a separate entry point for
 * users who specifically want to scope to chat — but this modal is
 * the new default surfaced from the More menu.
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { format } from 'date-fns';
import { ScrollText, Trash2, MessageSquare, Wrench } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Settings } from '../../domain/types';

type FilterMode = 'all' | 'chat' | 'direct';

// Stable fallbacks — never inline `?? []` in a Zustand selector (Iron Rule #21).
const EMPTY_CHAT_LOG: Settings['chatAuditLog'] = [];
const EMPTY_DIRECT_LOG: Settings['auditLog'] = [];

export function AuditLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chatLogRaw = useBudget((s) => s.settings.chatAuditLog);
  const chatLog = chatLogRaw ?? EMPTY_CHAT_LOG;
  const directLogRaw = useBudget((s) => s.settings.auditLog);
  const directLog = directLogRaw ?? EMPTY_DIRECT_LOG;
  const [mode, setMode] = useState<FilterMode>('all');
  const [kind, setKind] = useState<string>('all');

  const merged = useMemo(() => {
    const all: Array<{
      id: string;
      at: number;
      description: string;
      source: 'chat' | 'direct';
      kind?: string;
      canUndo?: boolean;
    }> = [];
    if (mode !== 'direct') {
      for (const e of chatLog) {
        all.push({ id: 'c-' + e.id, at: e.at, description: e.description, source: 'chat', canUndo: e.canUndo });
      }
    }
    if (mode !== 'chat') {
      for (const e of directLog) {
        all.push({ id: 'd-' + e.id, at: e.at, description: e.description, source: 'direct', kind: e.kind });
      }
    }
    if (kind !== 'all') {
      return all.filter((e) => e.kind === kind);
    }
    return all.sort((a, b) => b.at - a.at);
  }, [chatLog, directLog, mode, kind]);

  function clearAll() {
    if (!confirm('Clear all audit log entries? This cannot be undone.')) return;
    if (mode !== 'direct') setSettingsField('chatAuditLog', []);
    if (mode !== 'chat') setSettingsField('auditLog', []);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><ScrollText size={14} className="text-accent" /> Audit log</span>}
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={clearAll} disabled={merged.length === 0}>
            <Trash2 size={13} /> Clear visible
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="text-[13px] space-y-3">
        <p className="text-fg-muted text-[12.5px]">
          Every mutation, both chat-driven and direct edits. Synced across
          devices. Direct edits cover rename / delete / recategorize /
          schedule changes / imports.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-fg-subtle">Source:</span>
          {(['all', 'direct', 'chat'] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2 py-0.5 rounded-full border',
                mode === m ? 'bg-accent text-accent-fg border-accent' : 'border-border text-fg-muted hover:text-fg',
              )}
            >{m === 'all' ? 'All' : m === 'chat' ? 'Chat' : 'Direct'}</button>
          ))}
          <span className="text-fg-subtle ml-2">Kind:</span>
          {(['all', 'create', 'update', 'delete', 'import'] as string[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'px-2 py-0.5 rounded-full border',
                kind === k ? 'bg-accent text-accent-fg border-accent' : 'border-border text-fg-muted hover:text-fg',
              )}
            >{k === 'all' ? 'All' : k.charAt(0).toUpperCase() + k.slice(1)}</button>
          ))}
        </div>

        {merged.length === 0 ? (
          <div className="text-fg-subtle text-center py-8">No matching entries.</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
            {merged.map((e) => (
              <div key={e.id} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex-shrink-0 w-5 h-5 rounded-full grid place-items-center',
                      e.source === 'chat' ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-fg-muted',
                    )}
                    title={e.source === 'chat' ? 'Chat-driven' : 'Direct edit'}
                  >
                    {e.source === 'chat' ? <MessageSquare size={11} /> : <Wrench size={11} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.description}</div>
                    <div className="text-[10.5px] text-fg-subtle tabular">
                      {format(new Date(e.at), 'MMM d, h:mm a')}
                      {e.kind && <span> · {e.kind}</span>}
                    </div>
                  </div>
                </div>
                {e.canUndo && (
                  <span className="text-[10.5px] text-fg-subtle bg-surface-2 rounded px-1.5 py-0.5">
                    undoable
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
