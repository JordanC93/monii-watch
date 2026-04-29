/**
 * Tax Preparation report card.
 *
 * Per-deductible-category totals for the selected year, exportable as CSV.
 * The user flags which categories are tax-deductible (and what kind) on the
 * EditCategoryModal; this page aggregates spending in those categories
 * across the chosen year.
 *
 * "Spending" = SUM of negative amounts in transactions on on-budget
 * accounts within the year, grouped by category. Inflows (refunds,
 * reimbursements) net against the deduction.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META, type Category } from '../../domain/types';
import { Button } from '../ui/Button';
import { Download } from 'lucide-react';

const DEDUCTION_LABELS: Record<NonNullable<Category['taxDeductible']>, string> = {
  charitable: 'Charitable',
  medical: 'Medical',
  business: 'Business',
  home_office: 'Home Office',
  education: 'Education',
  other: 'Other',
};

export function TaxPreparation() {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  // Year selector — default current year, allow last 3.
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const onBudgetIds = useMemo(
    () => new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id)),
    [accounts],
  );

  const deductibleCats = useMemo(
    () => categories.filter((c) => !!c.taxDeductible),
    [categories],
  );

  // Group totals: Map<categoryId, { netCents }>
  const totals = useMemo(() => {
    const result = new Map<string, number>();
    for (const c of deductibleCats) result.set(c.id, 0);
    const yearStr = `${year}-`;
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (!t.date.startsWith(yearStr)) continue;
      // Direct category txns
      if (t.categoryId && result.has(t.categoryId)) {
        result.set(t.categoryId, result.get(t.categoryId)! + t.amount);
      }
      // Splits
      for (const s of t.splits) {
        if (s.categoryId && result.has(s.categoryId)) {
          result.set(s.categoryId, result.get(s.categoryId)! + s.amount);
        }
      }
    }
    return result;
  }, [txns, onBudgetIds, deductibleCats, year]);

  // Group categories by deductible kind for display.
  const grouped = useMemo(() => {
    const m = new Map<NonNullable<Category['taxDeductible']>, Array<{ cat: Category; net: number }>>();
    for (const c of deductibleCats) {
      const net = totals.get(c.id) ?? 0;
      const key = c.taxDeductible!;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({ cat: c, net });
    }
    return m;
  }, [deductibleCats, totals]);

  const grandTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0);

  function exportCsv() {
    const lines = ['Deductible Bucket,Category,Net Amount (USD)'];
    for (const [bucket, rows] of grouped) {
      for (const { cat, net } of rows) {
        // Negative amounts -> deductions are reported as positive dollars.
        const usd = (-net / 100).toFixed(2);
        lines.push(`${DEDUCTION_LABELS[bucket]},"${cat.name.replace(/"/g, '""')}",${usd}`);
      }
    }
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tax-prep-${year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (deductibleCats.length === 0) {
    return (
      <div className="text-[12.5px] text-fg-subtle">
        No categories tagged as tax-deductible yet. Open any category in Edit and pick a deductible kind to start tracking.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px] flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-fg-subtle">Year:</span>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              aria-pressed={y === year}
              aria-label={`View tax preparation for ${y}`}
              className={`px-2 py-0.5 rounded text-[11.5px] font-medium ${y === year ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg'}`}
            >
              {y}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download size={12} /> Export CSV
        </Button>
      </div>

      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([bucket, rows]) => {
          const bucketTotal = rows.reduce((s, r) => s + r.net, 0);
          return (
            <div key={bucket} className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-surface-2/40 flex items-center justify-between text-[11.5px] font-semibold">
                <span>{DEDUCTION_LABELS[bucket]}</span>
                <span className="tabular">{fmt(-bucketTotal)}</span>
              </div>
              <div className="divide-y divide-border/60">
                {rows.map(({ cat, net }) => (
                  <div key={cat.id} className="px-3 py-1.5 flex items-center justify-between text-[12px]">
                    <span className="truncate">{cat.name}</span>
                    <span className="tabular text-fg-muted">{fmt(-net)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[13px] font-semibold pt-2 border-t border-border">
        <span>Grand total ({year})</span>
        <span className="tabular text-positive">{fmt(-grandTotal)}</span>
      </div>
    </div>
  );
}
