/**
 * IOU entry modal — add or edit a single IOU ledger entry.
 *
 * Lives on Settings.iouLedger (a synced array). Positive balance =
 * they owe you, negative = you owe them. The Reports IOU card is
 * built on top of this; this modal is the single editor.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MoneyInput } from '../ui/MoneyInput';
import { useBudget } from '../../store/budget';
import { upsertIou, deleteIou } from '../../db/repo';
import { Trash2 } from 'lucide-react';

type Props = { open: boolean; onClose: () => void; entryId?: string };

export function IouEntryModal({ open, onClose, entryId }: Props) {
  const ledger = useBudget((s) => s.settings.iouLedger);
  const existing = entryId ? ledger.find((e) => e.id === entryId) : undefined;
  const [name, setName] = useState(existing?.personName ?? '');
  // Use absolute cents in input + a direction toggle so users don't
  // have to think about signed numbers.
  const [direction, setDirection] = useState<'theyOwe' | 'youOwe'>(
    (existing?.balance ?? 0) >= 0 ? 'theyOwe' : 'youOwe',
  );
  const [amount, setAmount] = useState<number>(Math.abs(existing?.balance ?? 0));
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function save() {
    if (!name.trim()) return;
    const signed = direction === 'theyOwe' ? amount : -amount;
    upsertIou({ id: entryId, personName: name.trim(), balance: signed, notes: notes.trim() || undefined });
    onClose();
  }
  function remove() {
    if (entryId && confirm('Delete this IOU?')) {
      deleteIou(entryId);
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entryId ? 'Edit IOU' : 'Add IOU'}
      footer={
        <div className="flex justify-between gap-2">
          {entryId && <Button variant="danger" size="sm" onClick={remove}><Trash2 size={13} /> Delete</Button>}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div>
          <label className="block text-[12px] font-medium mb-1">Person</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam, Jess, Mom…" autoFocus />
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1">Direction</label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="IOU direction">
            <button
              onClick={() => setDirection('theyOwe')}
              role="radio"
              aria-checked={direction === 'theyOwe'}
              className={`px-3 py-2 rounded-lg border text-[12.5px] font-medium ${direction === 'theyOwe' ? 'bg-positive/15 border-positive text-positive' : 'border-border text-fg-muted'}`}
            >
              They owe me
            </button>
            <button
              onClick={() => setDirection('youOwe')}
              role="radio"
              aria-checked={direction === 'youOwe'}
              className={`px-3 py-2 rounded-lg border text-[12.5px] font-medium ${direction === 'youOwe' ? 'bg-negative/15 border-negative text-negative' : 'border-border text-fg-muted'}`}
            >
              I owe them
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1">Amount</label>
          <MoneyInput value={amount} onCommit={setAmount} className="w-full" />
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What for? Promised by when?"
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[13px] focus:outline-none focus:border-accent resize-y"
          />
        </div>
      </div>
    </Modal>
  );
}
