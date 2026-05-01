/**
 * Quarterly review prompt — shown once on the 1st of each new quarter.
 *
 * Bigger picture than the monthly review. Asks: "Is this budget still
 * right for you?" + a 1–5 satisfaction rating + a free-text journal
 * entry. Surfaces a few summary stats from the just-ended quarter:
 * total income, total spent, savings rate, top category.
 *
 * Stamps `Settings.quarterlyReviewLastShown` so it doesn't re-fire
 * within the same quarter. Records to `Settings.quarterlyReviews[]`.
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { Star, BarChart3 } from 'lucide-react';

export function QuarterlyReviewModal({ open, onClose, quarter }: { open: boolean; onClose: () => void; quarter: string }) {
  const settings = useBudget((s) => s.settings);
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const [rating, setRating] = useState(3);
  const [note, setNote] = useState('');

  const stats = useMemo(() => {
    const onBudgetIds = new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id));
    const months = monthsInQuarter(quarter);
    let income = 0, spent = 0;
    const byCat = new Map<string, number>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      const m = t.date.slice(0, 7);
      if (!months.includes(m)) continue;
      if (t.amount > 0) income += t.amount;
      else if (t.amount < 0) {
        spent += -t.amount;
        if (t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + -t.amount);
      }
    }
    const savingsRate = income > 0 ? Math.max(0, (income - spent) / income) : 0;
    const top = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
    return { income, spent, savingsRate, topCategoryId: top?.[0] ?? null, topAmount: top?.[1] ?? 0 };
  }, [accounts, txns, quarter]);

  function save() {
    const reviews = settings.quarterlyReviews ?? [];
    const filtered = reviews.filter((r) => r.quarter !== quarter);
    filtered.push({ quarter, rating, note: note.trim(), createdAt: Date.now() });
    filtered.sort((a, b) => (a.quarter < b.quarter ? 1 : -1));
    setSettingsField('quarterlyReviews', filtered);
    setSettingsField('quarterlyReviewLastShown', quarter);
    onClose();
  }
  function skip() {
    setSettingsField('quarterlyReviewLastShown', quarter);
    onClose();
  }

  const topCat = stats.topCategoryId ? categories.find((c) => c.id === stats.topCategoryId) : null;

  return (
    <Modal
      open={open}
      onClose={skip}
      title={<span className="flex items-center gap-1.5"><BarChart3 size={14} className="text-accent" /> Quarterly review</span>}
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={skip}>Skip</Button>
          <Button onClick={save}>Save review</Button>
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-fg-muted">
          {quarter}: a quick gut-check. Is your budget still right for you?
          The little journal builds up over time.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Income" value={fmt(stats.income)} className="text-positive" />
          <Stat label="Spent" value={fmt(stats.spent)} className="text-negative" />
          <Stat label="Savings rate" value={`${Math.round(stats.savingsRate * 100)}%`} />
          <Stat label="Top category" value={topCat ? topCat.name : '—'} subtitle={topCat ? fmt(stats.topAmount) : undefined} />
        </div>

        <div>
          <label className="block text-[12px] font-medium mb-1">How did the quarter feel?</label>
          <div className="flex gap-1" role="radiogroup" aria-label="Rate the quarter, 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                autoFocus={n === 3}
                className={`p-1.5 rounded ${rating >= n ? 'text-warning' : 'text-fg-subtle'} hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent`}
              >
                <Star size={20} fill={rating >= n ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium mb-1">Reflections</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="What worked? What needs to change next quarter? Any goals you want to add?"
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[13px] focus:outline-none focus:border-accent resize-y"
          />
        </div>
      </div>
    </Modal>
  );
}

function monthsInQuarter(q: string): string[] {
  const [yStr, qStr] = q.split('-Q');
  const y = parseInt(yStr, 10);
  const Q = parseInt(qStr, 10);
  const first = (Q - 1) * 3 + 1; // 1, 4, 7, 10
  return [first, first + 1, first + 2].map((m) => `${y}-${String(m).padStart(2, '0')}`);
}

function Stat({ label, value, className, subtitle }: { label: string; value: string; className?: string; subtitle?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/40 border border-border px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-[15px] font-semibold tabular truncate ${className ?? ''}`}>{value}</div>
      {subtitle && <div className="text-[10px] text-fg-subtle mt-0.5">{subtitle}</div>}
    </div>
  );
}
