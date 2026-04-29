/**
 * Surfaces the goal-item-price "deal alert" globally on the Budget page.
 *
 * Why here: the Goals page already renders a per-tile alert, but most of
 * the user's day-to-day attention is on the Budget page. Surfacing the
 * alert above the budget table means they don't have to navigate to
 * Goals to discover the price drop.
 *
 * Logic mirrors `GoalTile.dealAlert`:
 *   - For every category with `currentItemPrice` set
 *   - Where `priceAlertSilenceUntil` hasn't fired
 *   - Where the category's currently-available envelope balance ≥ the
 *     current item price
 * → render a banner with category name, current price, current available,
 *   and an "Open store page" link if `link` is set.
 *
 * The banner also shows a separate "you reached your goal" message that
 * canNOT be silenced — when `available >= goal.amount`, regardless of
 * the silence timer.
 */

import { useMemo } from 'react';
import { Tag, ExternalLink, Target, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeMonthBudgetCached as computeMonthBudget } from '../../domain/budgetCache';
import { useFormatMoney } from '../../lib/format';
import { updateCategory } from '../../db/repo';
import { CategoryAvatar } from '../ui/CategoryAvatar';

export function GoalDealBanner() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  // computeMonthBudget returns Map<categoryId, { assigned, activity, available }>.
  const monthBudget = useMemo(
    () => computeMonthBudget(accounts, categories, txns, assignments, month),
    [accounts, categories, txns, assignments, month],
  );
  const availableById = useMemo(() => {
    const m = new Map<string, number>();
    for (const [catId, row] of monthBudget) m.set(catId, row.available);
    return m;
  }, [monthBudget]);

  const dealAlerts = useMemo(() => {
    const now = Date.now();
    const out: Array<{
      cat: typeof categories[number];
      available: number;
      currentPrice: number;
      kind: 'deal' | 'goal-met';
    }> = [];
    for (const c of categories) {
      const available = availableById.get(c.id) ?? 0;
      // "You reached the goal" — uncancellable.
      if (c.goal && c.goal.amount > 0 && available >= c.goal.amount) {
        out.push({ cat: c, available, currentPrice: c.goal.amount, kind: 'goal-met' });
        continue;
      }
      // "Deal alert" — silenceable.
      if (!c.currentItemPrice || c.currentItemPrice <= 0) continue;
      if ((c.priceAlertSilenceUntil ?? 0) > now) continue;
      if (available < c.currentItemPrice) continue;
      out.push({ cat: c, available, currentPrice: c.currentItemPrice, kind: 'deal' });
    }
    return out;
  }, [categories, availableById]);

  if (dealAlerts.length === 0) return null;

  function silence(catId: string) {
    updateCategory(catId, { priceAlertSilenceUntil: Date.now() + 90 * 24 * 60 * 60 * 1000 });
  }

  return (
    <div className="space-y-2">
      {dealAlerts.map(({ cat, available, currentPrice, kind }) => (
        <div
          key={cat.id + kind}
          className={`glass-panel ring-1 p-3 sm:p-3.5 flex items-start gap-3 ${
            kind === 'goal-met' ? 'ring-positive/40' : 'ring-positive/30'
          }`}
        >
          <div className="flex-shrink-0">
            <CategoryAvatar
              customImageDataUrl={cat.customImageDataUrl}
              icon={cat.icon}
              emoji={cat.emoji}
              size={36}
              bgClassName="bg-positive/15"
              textClassName="text-positive"
              alt={cat.name}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              {kind === 'goal-met' ? <Target size={13} className="text-positive" /> : <Tag size={13} className="text-positive" />}
              <span className="truncate">
                {kind === 'goal-met'
                  ? <>You reached your <strong>{cat.name}</strong> goal</>
                  : <><strong>{cat.name}</strong> is at a price you can afford</>}
              </span>
            </div>
            <div className="text-[12px] text-fg-muted mt-0.5">
              {kind === 'goal-met'
                ? <>You have <strong className="text-positive">{fmt(available)}</strong> available — target was {fmt(currentPrice)}.</>
                : <>Current price <strong>{fmt(currentPrice)}</strong> · you have <strong className="text-positive">{fmt(available)}</strong> available.</>}
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5 text-[11.5px]">
              {cat.link && (
                <a
                  href={cat.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-positive hover:underline flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Open
                </a>
              )}
              {kind === 'deal' && (
                <button
                  onClick={() => silence(cat.id)}
                  className="text-fg-subtle hover:text-fg flex items-center gap-1"
                  aria-label={`Silence deal alerts for ${cat.name} for 90 days`}
                >
                  <X size={11} /> Silence 90 days
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
