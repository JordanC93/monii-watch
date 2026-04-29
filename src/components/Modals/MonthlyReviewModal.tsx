/**
 * End-of-month review modal. Auto-prompts on the 1st (and any later
 * day if the user hasn't responded yet), surfacing last month's
 * stats and asking for a 1-5 rating + free-text note.
 *
 * Builds a journal over time (Settings.monthlyReviews[]). The
 * Year-in-Review later surfaces these as "what you wrote at the end
 * of each month".
 */

import { useState, useMemo } from 'react';
import { Star } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setMonthlyReview } from '../../db/repo';
import { computeMonthStats } from '../../domain/budget';
import { useFormatMoney } from '../../lib/format';
import { formatMonthLong, shiftMonth } from '../../domain/date';
import { cn } from '../../lib/cn';

export function MonthlyReviewModal({ open, onClose, month }: { open: boolean; onClose: () => void; month: string }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const reviews = useBudget((s) => s.settings.monthlyReviews);
  const fmt = useFormatMoney();

  const existing = reviews?.find((r) => r.month === month);
  const [rating, setRating] = useState(existing?.rating ?? 3);
  const [note, setNote] = useState(existing?.note ?? '');

  const stats = useMemo(() => computeMonthStats(accounts, txns, month), [accounts, txns, month]);
  const prevStats = useMemo(() => computeMonthStats(accounts, txns, shiftMonth(month, -1)), [accounts, txns, month]);
  const spentDelta = stats.spent - prevStats.spent;

  function save() {
    setMonthlyReview(month, rating, note.trim());
    onClose();
  }
  function skip() {
    setMonthlyReview(month, 0, ''); // recorded as "shown but skipped"
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`How was ${formatMonthLong(month)}?`}
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={skip}>Skip</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Auto stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Income" value={fmt(stats.income)} tone="pos" />
          <Stat label="Spent" value={fmt(stats.spent)} tone="neg" />
          <Stat label="Net" value={fmt(stats.net)} tone={stats.net >= 0 ? 'pos' : 'neg'} />
        </div>
        {prevStats.spent > 0 && (
          <div className="text-[12px] text-fg-muted text-center">
            Spending {spentDelta >= 0 ? 'up' : 'down'}{' '}
            <strong className={spentDelta >= 0 ? 'text-warning' : 'text-positive'}>
              {fmt(Math.abs(spentDelta))}
            </strong>{' '}
            vs the prior month.
          </div>
        )}

        {/* Rating */}
        <div>
          <div className="text-[12px] text-fg-muted mb-1">How did the month feel?</div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn(
                  'p-1.5 rounded transition active:scale-95',
                  n <= rating ? 'text-warning' : 'text-fg-subtle hover:text-fg-muted',
                )}
                aria-label={`${n} stars`}
              >
                <Star size={26} fill={n <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
            <span className="ml-2 text-[12px] text-fg-subtle">
              {['', 'tough', 'meh', 'fine', 'good', 'great'][rating]}
            </span>
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="text-[12px] text-fg-muted">What stood out?</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Things you bought, things you avoided, what to repeat or change next month…"
            className="mt-1 w-full bg-surface-2 border border-border rounded p-2 text-[13px] min-h-[80px] resize-none"
          />
          <div className="text-[10.5px] text-fg-subtle mt-1">
            Stays on your device. Surfaced in next year's Year-in-Review.
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="bg-surface-2/40 rounded-lg p-2.5 text-center">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn(
        'text-[14px] font-semibold tabular mt-0.5',
        tone === 'pos' && 'text-positive',
        tone === 'neg' && 'text-negative',
      )}>{value}</div>
    </div>
  );
}
