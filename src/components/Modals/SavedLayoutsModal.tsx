/**
 * Saved view layouts — let users save current UI state as a named
 * snapshot ("Reconciliation mode", "Trip planning") and one-click
 * apply it back. Stores: active page (current route), sidebar collapse
 * state, density, applied saved-search.
 *
 * Synced via Settings.savedLayouts so layouts roam across devices.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { newId } from '../../domain/id';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, BookmarkCheck } from 'lucide-react';
import { toast } from '../../lib/toast';

export function SavedLayoutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const layouts = useBudget((s) => s.settings.savedLayouts ?? []);
  const [draftName, setDraftName] = useState('');
  const nav = useNavigate();

  function saveCurrent() {
    if (!draftName.trim()) return;
    const sidebarCollapsed = readSidebarCollapsed();
    const density = readDensity();
    const next = {
      id: newId(),
      name: draftName.trim(),
      page: window.location.pathname,
      sidebarCollapsed,
      density,
      createdAt: Date.now(),
    };
    setSettingsField('savedLayouts', [...layouts, next]);
    setDraftName('');
    toast.success(`Saved "${next.name}"`);
  }

  function applyLayout(layoutId: string) {
    const l = layouts.find((x) => x.id === layoutId);
    if (!l) return;
    if (l.sidebarCollapsed) writeSidebarCollapsed(l.sidebarCollapsed);
    if (l.density) {
      try { localStorage.setItem('monii:density', l.density); } catch {}
      void import('../../lib/density').then((m) => m.setDensity(l.density!));
    }
    if (l.page) nav(l.page);
    onClose();
    toast.success(`Applied "${l.name}"`);
  }

  function deleteLayout(layoutId: string) {
    setSettingsField('savedLayouts', layouts.filter((l) => l.id !== layoutId));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><BookmarkCheck size={14} className="text-accent" /> Saved layouts</span>}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="text-[13px] space-y-3">
        <p className="text-fg-muted">
          Snapshot the current page + sidebar state + density into a named
          layout. One-click jump back later. Synced across devices.
        </p>
        <div className="flex gap-2">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder='e.g. "Reconciliation mode"'
            onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent(); }}
          />
          <Button onClick={saveCurrent} disabled={!draftName.trim()}>
            <Save size={13} /> Save current
          </Button>
        </div>
        {layouts.length === 0 ? (
          <div className="text-fg-subtle text-center py-6">No layouts yet.</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
            {layouts.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <button onClick={() => applyLayout(l.id)} className="flex-1 text-left min-w-0 hover:text-accent">
                  <div className="font-medium truncate">{l.name}</div>
                  <div className="text-[10.5px] text-fg-subtle truncate">
                    {l.page} {l.density && <>· density: {l.density}</>}
                  </div>
                </button>
                <button
                  onClick={() => deleteLayout(l.id)}
                  className="text-fg-subtle hover:text-negative p-1.5 rounded"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function readSidebarCollapsed() {
  try {
    const raw = localStorage.getItem('monii:sidebar-groups');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { onBudget: false, tracking: false };
}
function writeSidebarCollapsed(v: { onBudget: boolean; tracking: boolean }) {
  try { localStorage.setItem('monii:sidebar-groups', JSON.stringify(v)); } catch {}
}
function readDensity(): 'compact' | 'comfortable' | 'spacious' {
  try {
    const v = localStorage.getItem('monii:density');
    if (v === 'compact' || v === 'spacious') return v;
  } catch {}
  return 'comfortable';
}
