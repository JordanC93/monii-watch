/**
 * Goal-Funding Wizard.
 *
 * When the user clicks "Suggest allocations" on the Ready-to-Assign card,
 * this modal proposes a per-goal split weighted by deadline urgency +
 * amount remaining. The user reviews each line, can tweak, and clicks
 * Apply — assignments land via `adjustAssignment` for the selected month.
 *
 * Algorithm:
 *   1. Find every category with an underfunded goal (needed > 0).
 *   2. Score each by urgency:
 *      - targetByDate goals: 1 / max(monthsRemaining, 1)
 *      - monthlyFunding & targetBalance: a flat 1
 *   3. Allocate proportionally to score × needed, capped at `needed`.
 *   4. Spillover (because of caps) is redistributed once.
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { computeGoalProgress } from '../../domain/goals';
import { computeReadyToAssign } from '../../domain/budget';
import { computeMonthBudgetCached as computeMonthBudget } from '../../domain/budgetCache';
import type { Category } from '../../domain/types';
import { adjustAssignment } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { CategoryAvatar } from '../ui/CategoryAvatar';
import { tx } from '../../sync/doc';
import { toast } from '../../lib/toast';
import { Sparkles } from 'lucide-react';

type Suggestion = {
  categoryId: string;
  categoryName: string;
  needed: number;
  proposed: number;
  goalLabel: string;
  iconCat: Category;
};

export function GoalFundingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  const rta = useMemo(
    () => computeReadyToAssign(accounts, txns, assignments, month),
    [accounts, txns, assignments, month],
  );

  const initialSuggestions = useMemo(() => {
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, month);
    const eligible: Array<{ categoryId: string; categoryName: string; needed: number; goalLabel: string; urgency: number; cat: Category }> = [];
    for (const c of categories) {
      if (!c.goal || c.hidden) continue;
      const mb = monthBudget.get(c.id) ?? { assigned: 0, activity: 0, available: 0 };
      const prog = computeGoalProgress(c, month, mb.assigned, mb.available);
      if (prog.status !== 'underfunded' || prog.needed <= 0) continue;
      let urgency = 1;
      if (c.goal.type === 'targetByDate' && c.goal.dueDate) {
        const dueMonth = c.goal.dueDate.slice(0, 7);
        const monthsRemaining = Math.max(0, monthsDiff(month, dueMonth)) + 1;
        urgency = 1 / Math.max(monthsRemaining, 1);
      }
      eligible.push({
        categoryId: c.id,
        categoryName: c.name,
        needed: prog.needed,
        goalLabel: prog.label,
        urgency,
        cat: c,
      });
    }
    if (eligible.length === 0 || rta <= 0) return [] as Suggestion[];

    // Score = urgency × needed. Allocate proportionally, capped at needed.
    const totalScore = eligible.reduce((s, e) => s + e.urgency * e.needed, 0);
    let remaining = rta;
    const round1 = eligible.map((e) => {
      const share = totalScore === 0 ? 0 : (e.urgency * e.needed) / totalScore;
      const proposed = Math.min(e.needed, Math.floor(rta * share));
      remaining -= proposed;
      return { ...e, proposed };
    });
    // Distribute spillover to whoever still needs money, in priority order.
    if (remaining > 0) {
      const sorted = [...round1].sort((a, b) => b.urgency - a.urgency);
      for (const item of sorted) {
        if (remaining <= 0) break;
        const room = item.needed - item.proposed;
        const take = Math.min(room, remaining);
        item.proposed += take;
        remaining -= take;
      }
    }
    return round1.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      needed: r.needed,
      proposed: r.proposed,
      goalLabel: r.goalLabel,
      iconCat: r.cat,
    } as Suggestion));
  }, [accounts, categories, txns, assignments, month, rta]);

  const [draft, setDraft] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    for (const s of initialSuggestions) r[s.categoryId] = s.proposed;
    return r;
  });

  const totalProposed = Object.values(draft).reduce((s, v) => s + v, 0);
  const overBudget = totalProposed > rta;

  function apply() {
    if (overBudget) {
      toast.error('Allocations exceed Ready-to-Assign');
      return;
    }
    let count = 0;
    tx(() => {
      for (const [catId, cents] of Object.entries(draft)) {
        if (cents > 0) {
          adjustAssignment(month, catId, cents);
          count++;
        }
      }
    });
    toast.success(`Funded ${count} goal${count === 1 ? '' : 's'} · ${fmt(totalProposed)}`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><Sparkles size={14} className="text-accent" /> Goal-funding wizard</span>}
      size="lg"
      footer={
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="text-[12px] tabular">
            <span className="text-fg-muted">Allocating</span>{' '}
            <span className={`font-semibold ${overBudget ? 'text-negative' : 'text-fg'}`}>{fmt(totalProposed)}</span>
            <span className="text-fg-subtle"> / {fmt(rta)} available</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={apply} disabled={overBudget || totalProposed === 0}>Apply</Button>
          </div>
        </div>
      }
    >
      {initialSuggestions.length === 0 ? (
        <div className="text-[13px] text-fg-subtle text-center py-6">
          {rta <= 0
            ? 'No money to allocate yet — Ready-to-Assign is at zero.'
            : 'No underfunded goals to fund. All your goals are on track.'}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] text-fg-muted">
            Suggestions weighted by deadline urgency and amount still needed. Tweak any line, then Apply.
          </p>
          {initialSuggestions.map((s) => (
            <div key={s.categoryId} className="flex items-center gap-3 px-3 py-2 border border-border rounded-lg">
              <CategoryAvatar
                customImageDataUrl={s.iconCat.customImageDataUrl}
                icon={s.iconCat.icon}
                emoji={s.iconCat.emoji}
                size={32}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{s.categoryName}</div>
                <div className="text-[11px] text-fg-subtle truncate">
                  {s.goalLabel} · needs {fmt(s.needed)}
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={s.needed}
                  step={500}
                  value={draft[s.categoryId] ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.categoryId]: parseInt(e.target.value, 10) }))}
                  aria-label={`Allocation for ${s.categoryName}`}
                  aria-valuetext={fmt(draft[s.categoryId] ?? 0)}
                  className="w-20 sm:w-32 accent-accent"
                />
                <span className="tabular text-[13px] font-semibold w-20 text-right">
                  {fmt(draft[s.categoryId] ?? 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
