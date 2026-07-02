/**
 * Chat audit log — 30-day journal of every chat-driven mutation.
 *
 * Builds trust: the user can scroll back through what the chat panel
 * has done on their behalf. FIFO-pruned at 200 entries via `repo.ts →
 * logChatMutation`. Synced across devices.
 */

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { format } from 'date-fns';
import { ScrollText, Trash2 } from 'lucide-react';
import type { Settings } from '../../domain/types';

// Stable fallback — never inline `?? []` in a Zustand selector (Iron Rule #21).
const EMPTY_CHAT_LOG: Settings['chatAuditLog'] = [];

export function ChatAuditLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const logRaw = useBudget((s) => s.settings.chatAuditLog);
  const log = logRaw ?? EMPTY_CHAT_LOG;
  const sorted = [...log].sort((a, b) => b.at - a.at);

  function clearLog() {
    if (!confirm('Clear the chat audit log? This cannot be undone.')) return;
    setSettingsField('chatAuditLog', []);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><ScrollText size={14} className="text-accent" /> Chat audit log</span>}
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={clearLog} disabled={sorted.length === 0}>
            <Trash2 size={13} /> Clear log
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="text-[13px] space-y-2">
        <p className="text-fg-muted">
          Every mutation the chat panel made on your behalf, last 30 days.
          Synced across devices. {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}.
        </p>
        {sorted.length === 0 ? (
          <div className="text-fg-subtle text-center py-8">No chat-driven mutations yet.</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
            {sorted.map((e) => (
              <div key={e.id} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{e.description}</div>
                  <div className="text-[10.5px] text-fg-subtle tabular">
                    {format(new Date(e.at), 'MMM d, h:mm a')}
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
