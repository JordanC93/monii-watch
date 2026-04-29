/**
 * Lightweight US federal income-tax estimator. State tax is treated as a flat
 * user-supplied rate because state brackets vary too much for built-in tables
 * to be useful without ongoing maintenance, and we have no internet access to
 * pull live rates (privacy rule).
 *
 * This is a *planning* tool, not tax advice — gives a back-of-envelope total
 * burden estimate from gross annual income. Doesn't model deductions beyond the
 * standard deduction, AMT, payroll taxes, capital gains, EITC, or anything
 * else that a real CPA touches.
 */

import type { Money } from './types';
import { dollarsToCents } from './money';

export type FilingStatus = 'single' | 'marriedJoint' | 'marriedSeparate' | 'headOfHousehold';

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  marriedJoint: 'Married filing jointly',
  marriedSeparate: 'Married filing separately',
  headOfHousehold: 'Head of household',
};

/**
 * 2025 federal tax brackets (as published by the IRS for tax year 2025).
 * Values in DOLLARS, not cents — kept that way for readability against the
 * IRS source. Conversion to cents happens at compute time.
 */
type Bracket = { upTo: number; rate: number };

const BRACKETS_2025: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo:    11_925, rate: 0.10 },
    { upTo:    48_475, rate: 0.12 },
    { upTo:   103_350, rate: 0.22 },
    { upTo:   197_300, rate: 0.24 },
    { upTo:   250_525, rate: 0.32 },
    { upTo:   626_350, rate: 0.35 },
    { upTo:   Infinity, rate: 0.37 },
  ],
  marriedJoint: [
    { upTo:    23_850, rate: 0.10 },
    { upTo:    96_950, rate: 0.12 },
    { upTo:   206_700, rate: 0.22 },
    { upTo:   394_600, rate: 0.24 },
    { upTo:   501_050, rate: 0.32 },
    { upTo:   751_600, rate: 0.35 },
    { upTo:   Infinity, rate: 0.37 },
  ],
  marriedSeparate: [
    { upTo:    11_925, rate: 0.10 },
    { upTo:    48_475, rate: 0.12 },
    { upTo:   103_350, rate: 0.22 },
    { upTo:   197_300, rate: 0.24 },
    { upTo:   250_525, rate: 0.32 },
    { upTo:   375_800, rate: 0.35 },
    { upTo:   Infinity, rate: 0.37 },
  ],
  headOfHousehold: [
    { upTo:    17_000, rate: 0.10 },
    { upTo:    64_850, rate: 0.12 },
    { upTo:   103_350, rate: 0.22 },
    { upTo:   197_300, rate: 0.24 },
    { upTo:   250_500, rate: 0.32 },
    { upTo:   626_350, rate: 0.35 },
    { upTo:   Infinity, rate: 0.37 },
  ],
};

/** Standard deduction for tax year 2025, in dollars. */
const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_000,
  marriedJoint: 30_000,
  marriedSeparate: 15_000,
  headOfHousehold: 22_500,
};

export type TaxInput = {
  /** Gross annual income in cents. */
  annualIncome: Money;
  filingStatus: FilingStatus;
  /** Optional flat state rate as a decimal (0.05 = 5%). */
  stateRate?: number;
  /** Whether to apply the standard deduction. Default true. */
  useStandardDeduction?: boolean;
};

export type TaxResult = {
  grossAnnual: Money;
  taxableAnnual: Money;
  federalTax: Money;
  stateTax: Money;
  totalTax: Money;
  /** After-tax annual income. */
  takeHomeAnnual: Money;
  takeHomeMonthly: Money;
  /** Marginal rate that applies to the next dollar earned. */
  marginalRate: number;
  /** federalTax / grossAnnual — the headline number people quote. */
  effectiveFederalRate: number;
  /** totalTax / grossAnnual */
  effectiveTotalRate: number;
};

export function estimateTax(input: TaxInput): TaxResult {
  const useStd = input.useStandardDeduction ?? true;
  const grossDollars = input.annualIncome / 100;
  const stdDeductionDollars = useStd ? STANDARD_DEDUCTION[input.filingStatus] : 0;
  const taxableDollars = Math.max(0, grossDollars - stdDeductionDollars);

  const brackets = BRACKETS_2025[input.filingStatus];
  let federalDollars = 0;
  let prevCap = 0;
  let marginal = 0;
  for (const b of brackets) {
    if (taxableDollars <= prevCap) break;
    const slice = Math.min(taxableDollars, b.upTo) - prevCap;
    if (slice > 0) {
      federalDollars += slice * b.rate;
      marginal = b.rate;
    }
    prevCap = b.upTo;
  }
  // If income reaches the next bracket exactly, the next dollar earned is at that rate.
  for (const b of brackets) {
    if (taxableDollars < b.upTo) { marginal = b.rate; break; }
  }

  const stateDollars = (input.stateRate ?? 0) * taxableDollars;
  const totalDollars = federalDollars + stateDollars;
  const takeHomeDollars = grossDollars - totalDollars;

  return {
    grossAnnual: input.annualIncome,
    taxableAnnual: dollarsToCents(taxableDollars),
    federalTax: dollarsToCents(federalDollars),
    stateTax: dollarsToCents(stateDollars),
    totalTax: dollarsToCents(totalDollars),
    takeHomeAnnual: dollarsToCents(takeHomeDollars),
    takeHomeMonthly: dollarsToCents(takeHomeDollars / 12),
    marginalRate: marginal,
    effectiveFederalRate: grossDollars > 0 ? federalDollars / grossDollars : 0,
    effectiveTotalRate: grossDollars > 0 ? totalDollars / grossDollars : 0,
  };
}

export function formatPercent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
