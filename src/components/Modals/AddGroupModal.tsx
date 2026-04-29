import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { createGroup } from '../../db/repo';

export function AddGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  function submit() {
    if (!name.trim()) return;
    createGroup(name.trim());
    onClose();
    setName('');
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Category Group"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>Create</Button>
        </div>
      }
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Subscriptions, Goals, Pets"
        className="w-full"
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
    </Modal>
  );
}
