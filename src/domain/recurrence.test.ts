import { describe, expect, it } from 'vitest';
import { advanceDate, FREQUENCY_LABELS } from './recurrence';

describe('advanceDate', () => {
  it('advances daily', () => {
    expect(advanceDate('2026-04-15', 'daily')).toBe('2026-04-16');
    expect(advanceDate('2026-04-30', 'daily')).toBe('2026-05-01');
  });
  it('advances weekly', () => {
    expect(advanceDate('2026-04-15', 'weekly')).toBe('2026-04-22');
  });
  it('advances biweekly', () => {
    expect(advanceDate('2026-04-15', 'biweekly')).toBe('2026-04-29');
  });
  it('advances monthly', () => {
    expect(advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
    expect(advanceDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('advances yearly', () => {
    expect(advanceDate('2026-04-15', 'yearly')).toBe('2027-04-15');
  });
  it('handles end-of-month edge cases for monthly', () => {
    // Jan 31 → Feb 28 (date-fns clamps to last day of month)
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
});

describe('FREQUENCY_LABELS', () => {
  it('has labels for every frequency', () => {
    expect(FREQUENCY_LABELS.daily).toBe('Daily');
    expect(FREQUENCY_LABELS.weekly).toBe('Weekly');
    expect(FREQUENCY_LABELS.biweekly).toBe('Every 2 weeks');
    expect(FREQUENCY_LABELS.monthly).toBe('Monthly');
    expect(FREQUENCY_LABELS.yearly).toBe('Yearly');
  });
});
