import { useMemo } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeReadyToAssign } from '../../domain/budget';
import { computeMonthBudgetCached as computeMonthBudget } from '../../domain/budgetCache';
import { coverOverspending } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';
import { undo } from '../../store/undo';

/**
 * Banner shown above the budget table when one or more categories are overspent
 * in the current month. Surfaces the total deficit and offers a one-click
 * "cover from Ready to Assign" action capped at whatever RTA currently has.
 *
 * Renders nothing when there's no overspending — pure additive nudge.
 */
export function OverspendingAlert() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  const { overspentMap, totalDeficit, rta } = useMemo(() => {
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, month);
    const map = new Map<string, number>();
    let deficit = 0;
    for (const c of categories) {
      const m = monthBudget.get(c.id);
      if (m && m.available < 0) {
        const amt = -m.available;
        map.set(c.id, amt);
        deficit += amt;
      }
    }
    const r = computeReadyToAssign(accounts, txns, assignments, month);
    return { overspentMap: map, totalDeficit: deficit, rta: r };
  }, [accounts, categories, txns, assignments, month]);

  if (overspentMap.size === 0) return null;

  const canCover = rta > 0;
  const willCover = Math.min(rta, totalDeficit);
  const remainingAfter = totalDeficit - willCover;

  const overspentCategories = Array.from(overspentMap.entries())
    .map(([id, amt]) => ({ name: categories.find((c) => c.id === id)?.name ?? '?', amt }))
    .sort((a, b) => b.amt - a.amt);

  function onCover() {
    if (!canCover) return;
    const result = coverOverspending(month, overspentMap, rta);
    const n = result.perCategory.filter((p) => p.covered > 0).length;
    toast.success(`Covered ${fmt(result.moved)} across ${n} categor${n === 1 ? 'y' : 'ies'}`, {
      undo: () => undo(),
    });
  }

  return (
    <div className="glass-panel p-4 sm:p-5 ring-1 ring-negative/40">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-negative/15 text-negative grid place-items-center flex-shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold">
            {overspentMap.size} {overspentMap.size === 1 ? 'category is' : 'categories are'} overspent
            <span className="text-fg-muted font-normal"> · total {fmt(totalDeficit)}</span>
          </div>
          <div className="text-[12px] text-fg-subtle mt-0.5 truncate">
            {overspentCategories.slice(0, 4).map((c, i) => (
              <span key={c.name}>
                {i > 0 && <span className="mx-1">·</span>}
                {c.name} <span className="text-negative tabular">{fmt(-c.amt)}</span>
              </span>
            ))}
            {overspentCategories.length > 4 && <span className="ml-1">+{overspentCategories.length - 4} more</span>}
          </div>
        </div>
        <button
          onClick={onCover}
          disabled={!canCover}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium whitespace-nowrap',
            canCover
              ? 'bg-accent text-accent-fg hover:brightness-110'
              : 'bg-surface-3 text-fg-subtle cursor-not-allowed',
          )}
          title={canCover
            ? `Pull ${fmt(willCover)} from Ready to Assign`
            : 'No money in Ready to Assign — assign or earn more first'}
        >
          <Wand2 size={13} />
          {canCover ? `Cover ${fmt(willCover)}` : 'Cover (need RTA)'}
        </button>
      </div>
      {canCover && remainingAfter > 0 && (
        <div className="text-[11.5px] text-fg-subtle mt-2 ml-12">
          RTA only covers part of the deficit — {fmt(remainingAfter)} will still be overspent after covering.
        </div>
      )}
    </div>
  );
}
