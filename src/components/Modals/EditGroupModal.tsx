import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { updateGroup, deleteGroup } from '../../db/repo';

export function EditGroupModal({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const group = useBudget((s) => s.groups.find((g) => g.id === groupId));
  const [name, setName] = useState(group?.name ?? '');

  if (!group) return null;

  function save() {
    updateGroup(groupId, { name: name.trim() || group!.name });
    onClose();
  }

  function remove() {
    if (!confirm(`Delete group "${group!.name}"? Categories will move to "Misc".`)) return;
    deleteGroup(groupId);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Group"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="danger" onClick={remove}>Delete</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
        </div>
      }
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
    </Modal>
  );
}
