import { describe, expect, it } from 'vitest';
import {
  computeFireTarget, projectDeterministic, monteCarloSimulate,
  fireInputsFromSettings, WITHDRAWAL_SEQUENCE,
} from './fire';
import type { FireInputs } from './fire';

const baseInputs: FireInputs = {
  currentAge: 35,
  targetRetirementAge: 60,
  lifeExpectancy: 90,
  currentNetWorth: 50000000,        // $500k
  annualContribution: 3000000,      // $30k/yr
  targetAnnualSpending: 6000000,    // $60k/yr
  expectedReturnPct: 0.07,
  expectedStdevPct: 0.15,
  expectedInflationPct: 0.03,
};

describe('computeFireTarget', () => {
  it('25× annual spending', () => {
    const t = computeFireTarget(6000000);
    expect(t.fireNumber25x).toBe(150000000); // $1.5M
  });
  it('Lean = 33×, Fat = 20×', () => {
    const t = computeFireTarget(6000000);
    expect(t.leanFireNumber).toBe(Math.round(6000000 * 33.33));
    expect(t.fatFireNumber).toBe(120000000);
  });
});

describe('projectDeterministic', () => {
  it('returns a year-by-year series of length lifeExpectancy - currentAge + 1', () => {
    const p = projectDeterministic(baseInputs);
    expect(p.yearly.length).toBe(90 - 35 + 1);
  });
  it('NW at retirement is reasonable', () => {
    const p = projectDeterministic(baseInputs);
    // Rough back-of-envelope: $500k * 1.07^25 + $30k * compounded contributions
    // Should be over $2M nominal.
    expect(p.netWorthAtRetirement).toBeGreaterThan(200000000);
  });
  it('detects running out of money at impossibly low NW', () => {
    const p = projectDeterministic({
      ...baseInputs,
      currentNetWorth: 100000,        // $1k starting
      annualContribution: 0,          // No contributions
      targetAnnualSpending: 6000000,  // But spends $60k/yr
    });
    expect(p.ranOutOfMoney).toBe(true);
    expect(p.ranOutInYear).toBeGreaterThan(0);
  });
  it('clamps net worth at zero every year after running out (never negative)', () => {
    const p = projectDeterministic({
      ...baseInputs,
      currentNetWorth: 100000,
      annualContribution: 0,
      targetAnnualSpending: 6000000,
    });
    expect(p.ranOutOfMoney).toBe(true);
    expect(p.yearly.every((v) => v >= 0)).toBe(true);
    expect(p.finalNetWorth).toBe(0);
  });
});

describe('Social Security surplus accretes to net worth', () => {
  // Already retired, SS pays $24k/yr against $12k/yr spending.
  const retiredWithSurplus: FireInputs = {
    currentAge: 70,
    targetRetirementAge: 70,
    lifeExpectancy: 80,
    currentNetWorth: 10000000,     // $100k
    annualContribution: 0,
    targetAnnualSpending: 1200000, // $12k/yr
    expectedReturnPct: 0,
    expectedStdevPct: 0,
    expectedInflationPct: 0,
    socialSecurityStartAge: 62,
    socialSecurityMonthly: 200000, // $2k/mo = $24k/yr → $12k/yr surplus
  };

  it('deterministic: NW grows by the exact surplus each year at 0% return', () => {
    const p = projectDeterministic(retiredWithSurplus);
    expect(p.yearly.length).toBe(11);
    for (let i = 1; i < p.yearly.length; i++) {
      expect(p.yearly[i]).toBe(p.yearly[i - 1] + 1200000);
    }
    expect(p.finalNetWorth).toBe(10000000 + 10 * 1200000);
    expect(p.ranOutOfMoney).toBe(false);
  });

  it('deterministic: surplus compounds with returns and beats the break-even SS scenario', () => {
    const withSurplus = projectDeterministic({ ...retiredWithSurplus, expectedReturnPct: 0.05 });
    const breakEven = projectDeterministic({
      ...retiredWithSurplus,
      expectedReturnPct: 0.05,
      socialSecurityMonthly: 100000, // $1k/mo = exactly covers spending
    });
    // Break-even leaves the principal compounding untouched.
    let expected = 10000000;
    for (let i = 0; i < 10; i++) expected = Math.round(expected * 1.05);
    expect(breakEven.finalNetWorth).toBe(expected);
    expect(withSurplus.finalNetWorth).toBeGreaterThan(breakEven.finalNetWorth);
  });

  it('monte carlo (stdev 0 = deterministic sampling): p50 is non-decreasing and beats break-even SS', () => {
    // With expectedStdevPct 0, sampleNormal collapses to the mean, so
    // every trial is identical and the percentile bands are exact.
    const surplus = monteCarloSimulate(retiredWithSurplus, 50);
    for (let i = 1; i < surplus.p50.length; i++) {
      expect(surplus.p50[i]).toBeGreaterThanOrEqual(surplus.p50[i - 1]);
    }
    const breakEven = monteCarloSimulate({ ...retiredWithSurplus, socialSecurityMonthly: 100000 }, 50);
    expect(surplus.p50[surplus.p50.length - 1]).toBeGreaterThan(breakEven.p50[breakEven.p50.length - 1]);
    expect(surplus.successProbability).toBe(1);
  });
});

describe('monteCarloSimulate', () => {
  it('returns 11 percentile values between 0 and lifeExpectancy', () => {
    const r = monteCarloSimulate(baseInputs, 100);
    expect(r.p10.length).toBe(90 - 35 + 1);
    expect(r.p50.length).toBe(90 - 35 + 1);
    expect(r.p90.length).toBe(90 - 35 + 1);
  });
  it('p10 ≤ p50 ≤ p90 at every step (within reason)', () => {
    const r = monteCarloSimulate(baseInputs, 200);
    // The percentile inequality holds at every year.
    for (let i = 0; i < r.p10.length; i++) {
      expect(r.p10[i]).toBeLessThanOrEqual(r.p50[i] + 100); // allow 1¢ rounding noise
      expect(r.p50[i]).toBeLessThanOrEqual(r.p90[i] + 100);
    }
  });
  it('success probability is between 0 and 1', () => {
    const r = monteCarloSimulate(baseInputs, 100);
    expect(r.successProbability).toBeGreaterThanOrEqual(0);
    expect(r.successProbability).toBeLessThanOrEqual(1);
  });
});

describe('fireInputsFromSettings', () => {
  it('returns null when required fields are missing', () => {
    const out = fireInputsFromSettings({} as any, 0, 0);
    expect(out).toBe(null);
  });
  it('uses defaults when optional fields unset', () => {
    const out = fireInputsFromSettings(
      { fireCurrentAge: 30, fireTargetAge: 60 } as any,
      10000000,
      2000000,
    );
    expect(out!.expectedReturnPct).toBe(0.07);
    expect(out!.lifeExpectancy).toBe(90);
  });
});

describe('WITHDRAWAL_SEQUENCE', () => {
  it('orders taxable → traditional → roth', () => {
    expect(WITHDRAWAL_SEQUENCE.map((s) => s.bucket)).toEqual(['taxable', 'traditional', 'roth']);
  });
});
