import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { parseAmountToCents } from '../../domain/calc';
import {
  estimateTax, formatPercent, FILING_STATUS_LABELS, type FilingStatus,
} from '../../domain/tax';
import { getStateByCode } from '../../domain/usaStateTax';

/**
 * Back-of-envelope US tax estimator. Pre-fills annual income from the user's
 * `monthlyIncome` setting × 12 if available, so the common case is one-click.
 *
 * Disclosure copy is intentional — this is a planning aid, not a substitute
 * for a real return.
 */
export function TaxCalculator() {
  const monthlyIncome = useBudget((s) => s.settings.monthlyIncome);
  const stateCode = useBudget((s) => s.settings.stateCode);
  const fmt = useFormatMoney();

  // Pre-fill the state rate from the saved state code so users don't have
  // to remember "California is 12.3%" every time they open the calculator.
  const stateMeta = getStateByCode(stateCode);
  const defaultStateRate = stateMeta ? (stateMeta.rate * 100).toFixed(2).replace(/\.0+$/, '') : '';

  const [annualText, setAnnualText] = useState<string>(
    monthlyIncome > 0 ? ((monthlyIncome * 12) / 100).toFixed(0) : '',
  );
  const [statusVal, setStatusVal] = useState<FilingStatus>('single');
  const [stateRateText, setStateRateText] = useState<string>(defaultStateRate);
  const [useStdDeduction, setUseStdDeduction] = useState(true);

  const annualCents = useMemo(() => parseAmountToCents(annualText), [annualText]);
  const stateRate = useMemo(() => {
    const n = parseFloat(stateRateText);
    return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) / 100 : 0;
  }, [stateRateText]);

  const result = useMemo(() => {
    if (!annualCents || annualCents <= 0) return null;
    return estimateTax({
      annualIncome: annualCents,
      filingStatus: statusVal,
      stateRate,
      useStandardDeduction: useStdDeduction,
    });
  }, [annualCents, statusVal, stateRate, useStdDeduction]);

  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
          <Calculator size={16} />
        </div>
        <div className="text-[12px] text-fg-subtle leading-snug">
          Quick US federal estimate using 2025 brackets and the standard deduction.
          State tax is a flat rate you supply. <strong>Planning aid only; not tax advice.</strong>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Annual gross income</label>
          <Input
            value={annualText}
            onChange={(e) => setAnnualText(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="mt-0.5 w-full text-right tabular"
          />
          {monthlyIncome > 0 && (
            <div className="text-[10.5px] text-fg-subtle mt-0.5">
              Pre-filled from Settings: {fmt(monthlyIncome)}/mo × 12
            </div>
          )}
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">Filing status</label>
          <Select
            value={statusVal}
            onChange={(e) => setStatusVal(e.target.value as FilingStatus)}
            className="mt-0.5"
          >
            {(Object.keys(FILING_STATUS_LABELS) as FilingStatus[]).map((k) => (
              <option key={k} value={k}>{FILING_STATUS_LABELS[k]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">State rate %</label>
          <Input
            value={stateRateText}
            onChange={(e) => setStateRateText(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="mt-0.5 w-full text-right tabular"
          />
          <div className="text-[10.5px] text-fg-subtle mt-0.5">
            {stateMeta
              ? `Pre-filled from ${stateMeta.name}${stateMeta.noTax ? ' (no state income tax)' : ''}. Set in Settings → General.`
              : 'Pick your state in Settings → General to auto-fill.'}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-fg-muted mb-3">
        <input
          type="checkbox"
          checked={useStdDeduction}
          onChange={(e) => setUseStdDeduction(e.target.checked)}
          className="accent-accent"
        />
        Apply standard deduction
      </label>

      {result ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-3 bg-surface-2/30">
            <Stat label="Federal tax" value={fmt(result.federalTax)} sub={formatPercent(result.effectiveFederalRate) + ' effective'} />
            <Stat label="State tax" value={fmt(result.stateTax)} sub={result.stateTax > 0 ? `${(stateRate * 100).toFixed(1)}% × taxable` : '—'} />
            <Stat label="Total tax burden" value={fmt(result.totalTax)} sub={formatPercent(result.effectiveTotalRate) + ' overall'} strong />
          </div>
          <div className="border border-border rounded-lg p-3 bg-positive/5">
            <Stat label="Take-home (year)" value={fmt(result.takeHomeAnnual)} strong />
            <Stat label="Take-home (month)" value={fmt(result.takeHomeMonthly)} />
            <Stat label="Marginal rate" value={formatPercent(result.marginalRate)} sub="next dollar earned" />
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-fg-subtle text-center py-4">
          Enter annual income above to see an estimate.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-[11.5px] text-fg-subtle">{label}</span>
      <span className="text-right">
        <span className={strong ? 'text-[14px] font-semibold tabular' : 'text-[13px] tabular'}>{value}</span>
        {sub && <div className="text-[10.5px] text-fg-subtle">{sub}</div>}
      </span>
    </div>
  );
}
