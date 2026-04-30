import { describe, expect, it } from 'vitest';
import { perPaycheckAmount, paychecksPerYear, nextPaycheck, PAY_FREQUENCY_LABELS } from './paySchedule';

describe('paychecksPerYear', () => {
  it('returns expected counts', () => {
    expect(paychecksPerYear('weekly')).toBe(52);
    expect(paychecksPerYear('biweekly')).toBe(26);
    expect(paychecksPerYear('semimonthly')).toBe(24);
    expect(paychecksPerYear('monthly')).toBe(12);
    expect(paychecksPerYear('unset')).toBe(0);
  });
});

describe('perPaycheckAmount', () => {
  it('handles monthly', () => {
    expect(perPaycheckAmount(500000, 'monthly')).toBe(500000);
  });
  it('handles biweekly: monthly * 12 / 26', () => {
    expect(perPaycheckAmount(500000, 'biweekly')).toBe(Math.round(500000 * 12 / 26));
  });
  it('handles weekly', () => {
    expect(perPaycheckAmount(500000, 'weekly')).toBe(Math.round(500000 * 12 / 52));
  });
  it('handles semimonthly: monthly / 2', () => {
    expect(perPaycheckAmount(500000, 'semimonthly')).toBe(250000);
  });
  it('returns 0 for unset', () => {
    expect(perPaycheckAmount(500000, 'unset')).toBe(0);
  });
});

describe('nextPaycheck', () => {
  it('returns null without a frequency', () => {
    expect(nextPaycheck({ payFrequency: 'unset', payAnchorDate: '2026-04-01' }, '2026-04-15')).toBe(null);
  });
  it('returns null without an anchor', () => {
    expect(nextPaycheck({ payFrequency: 'biweekly', payAnchorDate: '' }, '2026-04-15')).toBe(null);
  });
  it('biweekly: rolls anchor forward to on/after today', () => {
    const next = nextPaycheck({ payFrequency: 'biweekly', payAnchorDate: '2026-04-03' }, '2026-04-15');
    // 4/3 + 14 = 4/17
    expect(next).toBe('2026-04-17');
  });
  it('weekly: same idea', () => {
    const next = nextPaycheck({ payFrequency: 'weekly', payAnchorDate: '2026-04-03' }, '2026-04-15');
    // 4/3 + 7 + 7 = 4/17
    expect(next).toBe('2026-04-17');
  });
  it('monthly: same day-of-month rolls forward', () => {
    const next = nextPaycheck({ payFrequency: 'monthly', payAnchorDate: '2026-01-15' }, '2026-04-20');
    expect(next).toBe('2026-05-15');
  });
});

describe('PAY_FREQUENCY_LABELS', () => {
  it('has labels for all frequencies', () => {
    expect(PAY_FREQUENCY_LABELS.weekly).toBe('Weekly');
    expect(PAY_FREQUENCY_LABELS.biweekly).toBe('Every 2 weeks');
    expect(PAY_FREQUENCY_LABELS.semimonthly).toBe('Twice a month');
    expect(PAY_FREQUENCY_LABELS.monthly).toBe('Monthly');
    expect(PAY_FREQUENCY_LABELS.unset).toBe('Not set');
  });
});
