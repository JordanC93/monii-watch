/**
 * FIRE / retirement planner (Tier 9 #3).
 *
 * Three core computations exposed:
 *
 *   1. `computeFireTarget(...)` — given current spending, return the
 *      4% / 25× target net worth to "retire" by today.
 *   2. `projectNetWorthAtAge(...)` — deterministic projection of
 *      net worth at the user's target age, given current NW + annual
 *      contribution + return.
 *   3. `monteCarloSimulate(...)` — 1000 simulations of the user's
 *      retirement, returning the 10th / 50th / 90th percentile
 *      success outcomes.
 *
 * All math is nominal (not inflation-adjusted) unless noted.
 * Pure functions — testable without the React tree.
 */

import type { Money, Settings } from './types';

export type FireInputs = {
  /** Current age in years. */
  currentAge: number;
  /** When the user wants to stop working. */
  targetRetirementAge: number;
  /** End of simulation horizon (typical 90-95). */
  lifeExpectancy: number;
  /** Current invested net worth (taxable + tax-advantaged) in cents. */
  currentNetWorth: Money;
  /** Annual contribution (post-tax savings) in cents. */
  annualContribution: Money;
  /** Annual spending in retirement, in cents. */
  targetAnnualSpending: Money;
  /** Expected nominal return as a decimal. 0.07 = 7%. */
  expectedReturnPct: number;
  /** Standard deviation for Monte Carlo. 0.15 = 15%. */
  expectedStdevPct: number;
  /** Expected inflation as a decimal. 0.03 = 3%. */
  expectedInflationPct: number;
  /** Social Security start age. Optional. */
  socialSecurityStartAge?: number;
  /** Expected monthly SS benefit in cents. Optional. */
  socialSecurityMonthly?: Money;
};

export type FireTarget = {
  /** Net worth needed to safely retire today, using 4% rule (25× spending). */
  fireNumber25x: Money;
  /** Lean FIRE: 33× expenses (3% withdrawal). Conservative. */
  leanFireNumber: Money;
  /** Fat FIRE: 20× expenses (5% withdrawal). Aggressive. */
  fatFireNumber: Money;
};

/**
 * Pure 4% / 3% / 5% rule targets. The classic Trinity Study results
 * suggest 4% is "safe-enough" for a 30-year retirement; 3% is more
 * conservative for longer time horizons or sequence-of-returns risk.
 */
export function computeFireTarget(targetAnnualSpending: Money): FireTarget {
  return {
    fireNumber25x: targetAnnualSpending * 25,
    leanFireNumber: Math.round(targetAnnualSpending * 33.33),
    fatFireNumber: targetAnnualSpending * 20,
  };
}

export type Projection = {
  /** Year-by-year net-worth values (cents). Index 0 = today, last = lifeExpectancy. */
  yearly: Money[];
  /** Net worth at retirement (in cents, nominal). */
  netWorthAtRetirement: Money;
  /** Years until retirement. */
  yearsToRetirement: number;
  /** Net worth at end of horizon (lifeExpectancy). */
  finalNetWorth: Money;
  /** Did the simulation run out of money? */
  ranOutOfMoney: boolean;
  /** Year (offset from today) the simulation ran out. -1 if never. */
  ranOutInYear: number;
};

/**
 * Deterministic projection using a fixed expected return. Good for
 * "if everything goes as planned" scenarios.
 *
 * Pre-retirement: NW grows at expectedReturn + annual contribution.
 * Post-retirement: NW grows at expectedReturn - annual spending +
 * SS income (when applicable). Spending inflates each year.
 */
export function projectDeterministic(input: FireInputs): Projection {
  const yearsTotal = Math.max(0, input.lifeExpectancy - input.currentAge);
  const yearsToRetirement = Math.max(0, input.targetRetirementAge - input.currentAge);
  const yearly: Money[] = [];
  let nw = input.currentNetWorth;
  let spending = input.targetAnnualSpending;
  let netWorthAtRetirement = nw;
  let ranOut = false;
  let ranOutInYear = -1;

  for (let y = 0; y <= yearsTotal; y++) {
    yearly.push(nw);
    if (y === yearsToRetirement) netWorthAtRetirement = nw;
    if (y === yearsTotal) break;

    // Apply growth on existing NW.
    nw = Math.round(nw * (1 + input.expectedReturnPct));

    if (y < yearsToRetirement) {
      // Working years: add the contribution.
      nw += input.annualContribution;
    } else {
      // Retirement years: subtract spending, optionally offset by SS.
      const age = input.currentAge + y + 1;
      let withdrawal = spending;
      if (input.socialSecurityStartAge && input.socialSecurityMonthly && age >= input.socialSecurityStartAge) {
        withdrawal -= input.socialSecurityMonthly * 12;
      }
      nw -= Math.max(0, withdrawal);
      if (nw < 0) {
        if (!ranOut) {
          ranOut = true;
          ranOutInYear = y + 1;
        }
        nw = 0;
      }
      // Inflate spending for next year.
      spending = Math.round(spending * (1 + input.expectedInflationPct));
    }
  }
  return {
    yearly,
    netWorthAtRetirement,
    yearsToRetirement,
    finalNetWorth: yearly[yearly.length - 1] ?? 0,
    ranOutOfMoney: ranOut,
    ranOutInYear,
  };
}

export type MonteCarloResult = {
  /** Per-year percentile lines (cents). 11 entries: today through life expectancy. */
  p10: Money[];
  p50: Money[];
  p90: Money[];
  /** Probability of NOT running out of money before life expectancy. 0..1. */
  successProbability: number;
  /** Total simulations run. */
  trials: number;
};

/**
 * Monte Carlo: run N simulations sampling annual returns from a
 * normal distribution centered at expectedReturn with stdev.
 * Returns 10th / 50th / 90th percentile NW per year + the success
 * probability.
 */
export function monteCarloSimulate(input: FireInputs, trials: number = 500): MonteCarloResult {
  const yearsTotal = Math.max(0, input.lifeExpectancy - input.currentAge);
  const yearsToRetirement = Math.max(0, input.targetRetirementAge - input.currentAge);
  // Pre-allocate trial × year matrix.
  const matrix: Money[][] = [];
  let successCount = 0;

  for (let t = 0; t < trials; t++) {
    const series: Money[] = [];
    let nw = input.currentNetWorth;
    let spending = input.targetAnnualSpending;
    let survived = true;
    for (let y = 0; y <= yearsTotal; y++) {
      series.push(nw);
      if (y === yearsTotal) break;
      const r = sampleNormal(input.expectedReturnPct, input.expectedStdevPct);
      nw = Math.round(nw * (1 + r));
      if (y < yearsToRetirement) {
        nw += input.annualContribution;
      } else {
        const age = input.currentAge + y + 1;
        let withdrawal = spending;
        if (input.socialSecurityStartAge && input.socialSecurityMonthly && age >= input.socialSecurityStartAge) {
          withdrawal -= input.socialSecurityMonthly * 12;
        }
        nw -= Math.max(0, withdrawal);
        if (nw < 0) {
          survived = false;
          nw = 0;
        }
        spending = Math.round(spending * (1 + input.expectedInflationPct));
      }
    }
    if (survived) successCount++;
    matrix.push(series);
  }

  // Compute percentiles year-by-year.
  const p10: Money[] = [];
  const p50: Money[] = [];
  const p90: Money[] = [];
  for (let y = 0; y <= yearsTotal; y++) {
    const col = matrix.map((row) => row[y] ?? 0).sort((a, b) => a - b);
    p10.push(col[Math.floor(col.length * 0.10)] ?? 0);
    p50.push(col[Math.floor(col.length * 0.50)] ?? 0);
    p90.push(col[Math.floor(col.length * 0.90)] ?? 0);
  }
  return {
    p10, p50, p90,
    successProbability: trials > 0 ? successCount / trials : 0,
    trials,
  };
}

/**
 * Box-Muller transform for sampling a normal distribution. Cheap
 * and adequate for portfolio simulations.
 */
function sampleNormal(mean: number, stdev: number): number {
  // Two independent uniform [0,1) samples.
  const u1 = Math.random() || Number.MIN_VALUE; // avoid log(0)
  const u2 = Math.random();
  // Standard normal.
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdev;
}

/**
 * Helper — pull FIRE inputs from Settings, defaulting where unset.
 * Returns null when the user hasn't entered the minimum required
 * fields (current age + target age).
 */
export function fireInputsFromSettings(
  settings: Pick<Settings, 'fireCurrentAge' | 'fireTargetAge' | 'fireTargetAnnualSpending'
    | 'fireExpectedReturnPct' | 'fireExpectedStdevPct' | 'fireExpectedInflationPct'
    | 'fireSocialSecurityStartAge' | 'fireSocialSecurityMonthly' | 'fireLifeExpectancy'>,
  currentNetWorth: Money,
  annualContribution: Money,
): FireInputs | null {
  if (!settings.fireCurrentAge || !settings.fireTargetAge) return null;
  return {
    currentAge: settings.fireCurrentAge,
    targetRetirementAge: settings.fireTargetAge,
    lifeExpectancy: settings.fireLifeExpectancy ?? 90,
    currentNetWorth,
    annualContribution,
    targetAnnualSpending: settings.fireTargetAnnualSpending ?? 0,
    expectedReturnPct: settings.fireExpectedReturnPct ?? 0.07,
    expectedStdevPct: settings.fireExpectedStdevPct ?? 0.15,
    expectedInflationPct: settings.fireExpectedInflationPct ?? 0.03,
    socialSecurityStartAge: settings.fireSocialSecurityStartAge,
    socialSecurityMonthly: settings.fireSocialSecurityMonthly,
  };
}

/**
 * Withdrawal sequencing: the optimal order to draw down accounts
 * in retirement. Returns the recommended order with brief rationale.
 */
export type WithdrawalSequenceItem = {
  bucket: 'taxable' | 'traditional' | 'roth';
  rationale: string;
};

export const WITHDRAWAL_SEQUENCE: WithdrawalSequenceItem[] = [
  {
    bucket: 'taxable',
    rationale: 'Pay tax only on gains (lower than ordinary income); preserves the tax-deferred growth in retirement accounts.',
  },
  {
    bucket: 'traditional',
    rationale: 'Withdrawals taxed as ordinary income. Doing this AFTER taxable lets you control your tax bracket once SS / RMDs kick in.',
  },
  {
    bucket: 'roth',
    rationale: 'Tax-free withdrawals — save for last so the most can grow tax-free. Ideal for legacy or end-of-retirement spending.',
  },
];
