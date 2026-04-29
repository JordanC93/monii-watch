import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { IconPicker } from '../ui/IconPicker';
import { CategoryIcon } from '../ui/CategoryIcon';
import { createCategory } from '../../db/repo';
import { suggestIconForLegacy } from '../../lib/categoryIcons';
import { cn } from '../../lib/cn';

const COLOR_OPTIONS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;

export function AddCategoryModal({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return;
    // If the user didn't explicitly pick one, infer from the name (e.g. "Groceries" → shopping-cart).
    const finalIcon = icon ?? suggestIconForLegacy(null, name.trim());
    createCategory({ groupId, name: name.trim(), color, icon: finalIcon });
    onClose();
    setName(''); setIcon(null); setColor(null);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Category"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>Create</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg border border-border bg-surface-2 grid place-items-center flex-shrink-0">
            <CategoryIcon icon={icon ?? suggestIconForLegacy(null, name)} size={18} />
          </div>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Groceries, Rent, Subscriptions…"
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Icon</div>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Color</div>
          <div className="flex gap-2">
            <button
              onClick={() => setColor(null)}
              className={cn('w-6 h-6 rounded-full border-2 grid place-items-center text-[10px] text-fg-subtle',
                color === null ? 'border-accent' : 'border-border')}
            >∅</button>
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn('w-6 h-6 rounded-full border-2',
                  color === c ? 'border-accent' : 'border-transparent',
                  `bg-flag-${c}`,
                )}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
