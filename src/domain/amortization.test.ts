import { describe, expect, it } from 'vitest';
import { amortize, compareExtraPayment, suggestedMonthlyPayment } from './amortization';

describe('amortize', () => {
  it('pays off a zero-rate loan in principal/payment months', () => {
    const out = amortize({ principal: 100000, annualRate: 0, monthlyPayment: 30000, firstPaymentDate: '2026-01-15' });
    expect(out.payoffMonths).toBe(4);
    expect(out.totalInterest).toBe(0);
    expect(out.totalPaid).toBe(100000);
    expect(out.rows[out.rows.length - 1].balance).toBe(0);
  });

  it('clamps end-of-month payment dates instead of overflowing into the next month', () => {
    const out = amortize({ principal: 100000, annualRate: 0, monthlyPayment: 30000, firstPaymentDate: '2026-01-31' });
    // Jan 31 anchor: Feb payment lands on Feb 28, NOT Mar 3
    expect(out.rows.map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(out.payoffDate).toBe('2026-04-30');
  });

  it('accrues interest on a positive-rate loan', () => {
    const out = amortize({ principal: 1200000, annualRate: 0.12, monthlyPayment: 110000, firstPaymentDate: '2026-01-01' });
    expect(out.rows[0].interest).toBe(12000); // 1% of $12,000
    expect(out.totalInterest).toBeGreaterThan(0);
    expect(out.rows[out.rows.length - 1].balance).toBe(0);
  });

  it('bails with a single row on negative amortization', () => {
    const out = amortize({ principal: 1200000, annualRate: 0.12, monthlyPayment: 1000, firstPaymentDate: '2026-01-01' });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].balance).toBeGreaterThan(1200000);
  });
});

describe('compareExtraPayment', () => {
  it('extra payments save months and interest', () => {
    const cmp = compareExtraPayment({
      principal: 1200000, annualRate: 0.12, monthlyPayment: 110000,
      firstPaymentDate: '2026-01-01', extraPerMonth: 50000,
    });
    expect(cmp.monthsSaved).toBeGreaterThan(0);
    expect(cmp.interestSaved).toBeGreaterThan(0);
  });
});

describe('suggestedMonthlyPayment', () => {
  it('zero rate divides evenly', () => {
    expect(suggestedMonthlyPayment(120000, 0, 12)).toBe(10000);
  });
  it('positive rate exceeds principal/term', () => {
    expect(suggestedMonthlyPayment(120000, 0.12, 12)).toBeGreaterThan(10000);
  });
});
