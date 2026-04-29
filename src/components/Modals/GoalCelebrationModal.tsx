/**
 * Goal completion celebration. Fires a confetti burst behind a small
 * congratulations card. Logs a milestone to localStorage so the user
 * can scroll back through historic wins.
 */

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Confetti } from '../ui/Confetti';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { Trophy } from 'lucide-react';
import { CategoryAvatar } from '../ui/CategoryAvatar';

export function GoalCelebrationModal({ open, onClose, categoryId }: { open: boolean; onClose: () => void; categoryId: string }) {
  const cat = useBudget((s) => s.categories.find((c) => c.id === categoryId));
  const fmt = useFormatMoney();
  if (!cat) return null;
  const goal = cat.goal;

  return (
    <>
      <Confetti />
      <Modal
        open={open}
        onClose={onClose}
        title={<span className="flex items-center gap-1.5"><Trophy size={14} className="text-warning" /> Goal reached!</span>}
        size="md"
        footer={
          <div className="flex justify-end">
            <Button onClick={onClose}>Nice</Button>
          </div>
        }
      >
        <div className="text-center py-2">
          <div className="flex justify-center mb-3">
            <CategoryAvatar
              customImageDataUrl={cat.customImageDataUrl}
              icon={cat.icon}
              emoji={cat.emoji}
              size={64}
              bgClassName="bg-warning/15 border-2 border-warning"
              textClassName="text-warning"
            />
          </div>
          <div className="text-[18px] font-semibold mb-1">{cat.name}</div>
          {goal && (
            <div className="text-[13px] text-fg-muted">
              You hit your goal of <strong className="text-fg">{fmt(goal.amount)}</strong>.
            </div>
          )}
          <div className="text-[12px] text-fg-subtle mt-3">
            Keep going. The next dollar still has a job.
          </div>
        </div>
      </Modal>
    </>
  );
}

