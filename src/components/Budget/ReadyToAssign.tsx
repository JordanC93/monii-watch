import { useBudget } from '../../store/budget';
import { computeReadyToAssign } from '../../domain/budget';
import { useFormatMoney } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Sparkles, AlertTriangle, Copy, Bookmark, Wand2 } from 'lucide-react';
import { computeGoalProgress } from '../../domain/goals';
import { computeMonthBudgetCached as computeMonthBudget } from '../../domain/budgetCache';
import { shiftMonth } from '../../domain/date';
import { copyAssignmentsBetweenMonths } from '../../db/repo';
import { toast } from '../../lib/toast';
import { undo } from '../../store/undo';
import { HelpHint } from '../ui/HelpHint';
import { useUI } from '../../store/ui';

export function ReadyToAssign() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();
  const openModal = useUI((s) => s.openModal);

  const rta = computeReadyToAssign(accounts, txns, assignments, month);
  const lastMonth = shiftMonth(month, -1);
  const lastMonthHasAssignments = assignments.some((a) => a.month === lastMonth && a.assigned > 0);
  const thisMonthHasAssignments = assignments.some((a) => a.month === month && a.assigned > 0);
  const showCopyButton = lastMonthHasAssignments && !thisMonthHasAssignments;

  // Goal-funding wizard CTA: show when RTA ≥ $500 AND at least one goal
  // is underfunded. The threshold is intentionally generous — we don't
  // want to nag users who have a few cents lying around.
  const hasUnderfundedGoal = (() => {
    if (rta < 50000) return false;
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, month);
    for (const c of categories) {
      if (!c.goal || c.hidden) continue;
      const mb = monthBudget.get(c.id) ?? { assigned: 0, activity: 0, available: 0 };
      const prog = computeGoalProgress(c, month, mb.assigned, mb.available);
      if (prog.status === 'underfunded' && prog.needed > 0) return true;
    }
    return false;
  })();

  function copyFromLastMonth() {
    if (!confirm(`Copy every assignment from ${lastMonth} into ${month}? This replaces any existing assignments for ${month}.`)) return;
    const result = copyAssignmentsBetweenMonths(lastMonth, month);
    toast.success(`Copied ${result.copied} assignment${result.copied === 1 ? '' : 's'} from ${lastMonth}`, {
      undo: () => undo(),
    });
  }

  let tone: 'positive' | 'zero' | 'negative' = 'zero';
  if (rta > 0) tone = 'positive';
  else if (rta < 0) tone = 'negative';

  return (
    <div className={cn(
      'glass-panel p-4 sm:p-5 flex items-center gap-4',
      tone === 'positive' && 'ring-1 ring-positive/30',
      tone === 'negative' && 'ring-1 ring-negative/40',
    )}>
      <div className={cn(
        'w-12 h-12 rounded-full grid place-items-center flex-shrink-0',
        tone === 'positive' && 'bg-positive/15 text-positive',
        tone === 'zero' && 'bg-surface-3 text-fg-muted',
        tone === 'negative' && 'bg-negative/15 text-negative',
      )}>
        {tone === 'negative' ? <AlertTriangle size={20} /> : <Sparkles size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] uppercase tracking-wider text-fg-subtle flex items-center gap-1">
          <span>Ready to Assign</span>
          <HelpHint title="Ready to Assign" side="bottom">
            Money you've received but haven't told Cashbook what to do with yet.
            Click any "Assigned" cell on the budget table to drop dollars into a
            category. The goal each month is to get this number to zero — every
            dollar with a job.
          </HelpHint>
        </div>
        <div className={cn(
          'text-2xl sm:text-3xl font-semibold tabular leading-tight',
          tone === 'positive' && 'text-positive',
          tone === 'zero' && 'text-fg',
          tone === 'negative' && 'text-negative',
        )}>{fmt(rta)}</div>
        <div className="text-[12px] text-fg-subtle mt-0.5">
          {tone === 'positive' && 'Give every dollar a job.'}
          {tone === 'zero' && 'Every dollar has a job. Well done.'}
          {tone === 'negative' && 'You\'ve over-assigned — pull money back from a category.'}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {hasUnderfundedGoal && (
          <button
            onClick={() => openModal({ type: 'goalFunding' })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-accent text-accent-fg hover:opacity-90 whitespace-nowrap"
            title="Suggest weighted allocations across underfunded goals"
          >
            <Wand2 size={12} /> Suggest allocations
          </button>
        )}
        {showCopyButton && (
          <button
            onClick={copyFromLastMonth}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-accent/15 text-accent hover:bg-accent/25 whitespace-nowrap"
            title="Apply every assignment from last month to this month"
          >
            <Copy size={12} /> Copy from {lastMonth}
          </button>
        )}
        <button
          onClick={() => openModal({ type: 'budgetTemplates' })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-surface-2/60 text-fg-muted hover:bg-surface-2 hover:text-fg whitespace-nowrap"
          title="Save / apply budget templates"
        >
          <Bookmark size={12} /> Templates
        </button>
      </div>
    </div>
  );
}
