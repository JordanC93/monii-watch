/**
 * End-of-year Tax Summary report card (Tier 6 #6).
 *
 * Aggregates everything tax-relevant for a given year into one screen:
 *   - Per-deductible-category totals
 *   - Charitable donations (subset)
 *   - Mortgage interest (from loan amortization, if data exists)
 *   - Investment dividends/cap gains (placeholder — uses positions
 *     metadata that we don't track per-tax-event yet)
 *   - Health expenses
 *   - Business / home-office expenses
 *
 * Print uses the existing print stylesheet (window.print()). CSV export
 * matches Tax Preparation's format but enriched.
 */

import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META, type Category } from '../../domain/types';
import { Button } from '../ui/Button';

const DEDUCTION_LABELS: Record<NonNullable<Category['taxDeductible']>, string> = {
  charitable: 'Charitable Donations',
  medical: 'Medical Expenses',
  business: 'Business Expenses',
  home_office: 'Home Office',
  education: 'Education / Tuition',
  other: 'Other Deductible',
};

export function TaxSummary() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const onBudgetIds = useMemo(
    () => new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id)),
    [accounts],
  );

  // Per-deductible-bucket totals.
  const deductibleTotals = useMemo(() => {
    const buckets = new Map<NonNullable<Category['taxDeductible']>, number>();
    const yearStr = `${year}-`;
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (!t.date.startsWith(yearStr)) continue;
      const apply = (catId: string | null, amount: number) => {
        if (!catId) return;
        const cat = categories.find((c) => c.id === catId);
        if (!cat?.taxDeductible) return;
        buckets.set(cat.taxDeductible, (buckets.get(cat.taxDeductible) ?? 0) + (-amount));
      };
      if (t.categoryId) apply(t.categoryId, t.amount);
      for (const s of t.splits) apply(s.categoryId, s.amount);
    }
    return buckets;
  }, [txns, categories, onBudgetIds, year]);

  // Mortgage interest — naïve estimate. Pulls loan accounts with
  // `loanInterestRate` and computes annual interest on average balance
  // for the year. (Real tax forms use the 1098 from the lender — we
  // surface this as a bookkeeping aid, not the form-of-record.)
  const mortgageInterest = useMemo(() => {
    let total = 0;
    for (const a of accounts) {
      if (a.type !== 'mortgage' && a.type !== 'loan') continue;
      if (!a.loanInterestRate || a.loanInterestRate <= 0) continue;
      // Sum balance at start of year vs end of year for an average.
      let startBal = 0;
      let endBal = 0;
      for (const t of txns) {
        if (t.accountId !== a.id) continue;
        if (t.date < `${year}-01-01`) startBal += t.amount;
        if (t.date <= `${year}-12-31`) endBal += t.amount;
      }
      const avgOwed = Math.abs(Math.round((startBal + endBal) / 2));
      total += Math.round(avgOwed * a.loanInterestRate);
    }
    return total;
  }, [accounts, txns, year]);

  const grandTotal = useMemo(() => {
    let n = 0;
    for (const v of deductibleTotals.values()) n += v;
    return n;
  }, [deductibleTotals]);

  function exportCsv() {
    const rows: Array<[string, string]> = [];
    rows.push(['End-of-Year Tax Summary', String(year)]);
    rows.push(['', '']);
    for (const [bucket, total] of deductibleTotals) {
      rows.push([DEDUCTION_LABELS[bucket], (total / 100).toFixed(2)]);
    }
    if (mortgageInterest > 0) {
      rows.push(['Mortgage Interest (estimate)', (mortgageInterest / 100).toFixed(2)]);
    }
    rows.push(['', '']);
    rows.push(['Total deductible (excl. mortgage)', (grandTotal / 100).toFixed(2)]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tax-summary-${year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printSummary() {
    window.print();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-fg-subtle">Year:</span>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              aria-pressed={y === year}
              className={`px-2 py-0.5 rounded text-[11.5px] font-medium ${y === year ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg'}`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download size={12} /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={printSummary}>
            <Printer size={12} /> Print / Save PDF
          </Button>
        </div>
      </div>

      {deductibleTotals.size === 0 && mortgageInterest === 0 ? (
        <div className="text-[12.5px] text-fg-subtle text-center py-3">
          No deductible categories or mortgage data for {year}. Tag categories on Edit to populate.
        </div>
      ) : (
        <div className="space-y-1.5">
          {Array.from(deductibleTotals.entries()).map(([bucket, total]) => (
            <div key={bucket} className="grid grid-cols-[1fr_auto] gap-2 text-[12.5px] py-1 border-b border-border/50">
              <div className="font-medium">{DEDUCTION_LABELS[bucket]}</div>
              <div className="tabular">{fmt(total)}</div>
            </div>
          ))}
          {mortgageInterest > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-2 text-[12.5px] py-1 border-b border-border/50">
              <div className="font-medium">
                Mortgage Interest (est.)
                <div className="text-[10.5px] text-fg-subtle font-normal">Use your 1098 for the official figure.</div>
              </div>
              <div className="tabular">{fmt(mortgageInterest)}</div>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2 text-[13px] font-semibold pt-2 border-t border-border">
            <div>Total deductible ({year})</div>
            <div className="tabular text-positive">{fmt(grandTotal + mortgageInterest)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
