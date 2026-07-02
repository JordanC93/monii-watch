/**
 * Workspace switcher modal (Tier 9 #4). Pick which budget you're
 * working in. Workspaces are local-per-device — switching reloads
 * the app to load that workspace's IndexedDB database.
 */

import { useState } from 'react';
import { Plus, Check, Trash2, Briefcase } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  listWorkspaces, getActiveWorkspaceId, switchWorkspace, createWorkspace,
  deleteWorkspace, renameWorkspace,
} from '../../lib/workspaces';
import { toast } from '../../lib/toast';

export function WorkspacesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const workspaces = listWorkspaces();
  const activeId = getActiveWorkspaceId();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  function bump() { setRefresh((x) => x + 1); }
  void refresh;

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    const ws = createWorkspace(label);
    setNewLabel('');
    setAdding(false);
    if (confirm(`Switch to "${ws.label}" now? The app will reload.`)) {
      switchWorkspace(ws.id);
    } else {
      bump();
    }
  }

  async function remove(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws || id === 'default') return;
    // Deleting the ACTIVE workspace can't work from inside it — this
    // tab's own persistence connection holds the database open, so the
    // delete would always come back blocked. Tell the user the fix.
    if (id === activeId) {
      toast.error('Switch to another workspace first, then delete this one.');
      return;
    }
    if (!confirm(`Delete workspace "${ws.label}" and ALL its data?\n\nThis cannot be undone. Export a backup first if you need it.`)) return;
    const result = await deleteWorkspace(id);
    if (!result.ok) {
      toast.error(`Couldn't delete "${ws.label}" — close this budget's other tabs/windows first, then try again.`);
      return;
    }
    toast.success(`Deleted "${ws.label}"`);
    bump();
  }

  function rename(id: string, label: string) {
    renameWorkspace(id, label);
    bump();
  }

  return (
    <Modal open={open} onClose={onClose} title="Workspaces" size="md">
      <div className="space-y-3">
        <div className="text-[12px] text-fg-subtle">
          Each workspace is a separate budget: separate accounts, transactions,
          categories, sync. Useful for keeping personal money apart from a
          business or shared household. Workspaces live on this device only;
          switching doesn't propagate to other devices.
        </div>

        <div className="space-y-1.5">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`bg-surface-2/40 rounded-md p-2.5 ring-1 ${w.id === activeId ? 'ring-accent/40' : 'ring-border'}`}
            >
              <div className="flex items-center gap-2">
                <Briefcase size={14} className="text-fg-subtle flex-shrink-0" />
                <Input
                  value={w.label}
                  onChange={(e) => rename(w.id, e.target.value)}
                  className="flex-1 text-[12.5px]"
                  disabled={w.id === 'default'}
                />
                {w.id === activeId ? (
                  <span className="text-[11px] text-accent flex items-center gap-1">
                    <Check size={11} /> Active
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (confirm(`Switch to "${w.label}"? The app will reload.`)) {
                        switchWorkspace(w.id);
                      }
                    }}
                  >
                    Switch
                  </Button>
                )}
                {w.id !== 'default' && (
                  <button
                    onClick={() => remove(w.id)}
                    className="text-fg-subtle hover:text-negative p-1 rounded"
                    aria-label={`Delete ${w.label}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {w.id === 'default' && (
                <div className="text-[10.5px] text-fg-subtle mt-1">
                  Default workspace. Can't be renamed or deleted.
                </div>
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <div className="bg-surface-2/60 rounded-md p-3 ring-1 ring-accent/40 space-y-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Business, Household, Side hustle"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={add} disabled={!newLabel.trim()}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewLabel(''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> New workspace
          </Button>
        )}

        <div className="text-[11px] text-fg-subtle italic pt-1">
          Each workspace has its own pairing phrase and sync state. Configure
          sync separately for each one.
        </div>
      </div>
    </Modal>
  );
}
