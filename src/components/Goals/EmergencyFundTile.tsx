/**
 * Right-sized emergency-fund recommendation tile (Tier 6 #11).
 *
 * Pinned to the top of the Goals page when:
 *   - emergencyFundCategoryId is set, OR
 *   - the recommendation hasn't been hit yet (encourages designation)
 *
 * Hides itself once the linked category's available reaches the
 * target.
 */

import { useMemo } from 'react';
import { Shield } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeMonthBudget } from '../../domain/budget';
import { computeTrailingMonthlyOutflow } from '../Settings/EmergencyFundSettings';
import { useFormatMoney } from '../../lib/format';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

export function EmergencyFundTile() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const nav = useNavigate();

  const linkedCategory = useMemo(() => {
    if (!settings.emergencyFundCategoryId) return null;
    return categories.find((c) => c.id === settings.emergencyFundCategoryId) ?? null;
  }, [categories, settings.emergencyFundCategoryId]);

  const trailingMonthly = useMemo(
    () => computeTrailingMonthlyOutflow(accounts, txns),
    [accounts, txns],
  );
  const targetMonths = settings.emergencyFundMonths || 3;
  const target = Math.round(trailingMonthly * targetMonths);

  const available = useMemo(() => {
    if (!linkedCategory) return 0;
    const mb = computeMonthBudget(accounts, categories, txns, assignments, month);
    return mb.get(linkedCategory.id)?.available ?? 0;
  }, [linkedCategory, accounts, categories, txns, assignments, month]);

  if (trailingMonthly === 0) return null;
  if (target === 0) return null;

  // If linked + already met, hide entirely.
  if (linkedCategory && available >= target) return null;

  const ratio = linkedCategory ? Math.min(1, available / target) : 0;
  const remaining = Math.max(0, target - available);

  return (
    <div className="glass-panel ring-1 ring-accent/30 p-4 sm:p-5 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
        <Shield size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold flex items-center gap-2">
          Right-sized emergency fund
          <span className="text-[11px] text-fg-subtle font-normal">
            ({targetMonths} mo × {fmt(Math.round(trailingMonthly))} avg outflow)
          </span>
        </div>
        <div className="text-[12px] text-fg-subtle mt-0.5">
          {linkedCategory
            ? <>Linked to <strong>{linkedCategory.name}</strong>. Target <strong>{fmt(target)}</strong> · current <strong className="text-positive">{fmt(available)}</strong> · need {fmt(remaining)} more.</>
            : <>Suggested target: <strong>{fmt(target)}</strong>. Pick a category in Settings → Emergency fund to track progress here.</>}
        </div>
        {linkedCategory && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <div className="text-[10.5px] text-fg-subtle mt-1 tabular">
              {Math.round(ratio * 100)}% there
            </div>
          </div>
        )}
        {!linkedCategory && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => nav('/settings')}
            className="mt-2"
          >
            Open Settings
          </Button>
        )}
      </div>
    </div>
  );
}
