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

describe('advanceDate with anchorDay', () => {
  it('snaps back to the anchor day after a clamped month', () => {
    expect(advanceDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(advanceDate('2026-04-30', 'monthly', 31)).toBe('2026-05-31');
  });
  it('still clamps when the anchor day does not fit', () => {
    expect(advanceDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(advanceDate('2024-01-31', 'monthly', 31)).toBe('2024-02-29');
  });
  it('does not drift across a full year of iteration', () => {
    let d = '2026-01-31';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      d = advanceDate(d, 'monthly', 31);
      seen.push(d);
    }
    expect(seen).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
  it('applies to yearly Feb-29 anchors', () => {
    expect(advanceDate('2025-02-28', 'yearly', 29)).toBe('2026-02-28');
    expect(advanceDate('2027-02-28', 'yearly', 29)).toBe('2028-02-29');
  });
  it('two-arg calls keep the legacy clamped behavior', () => {
    expect(advanceDate('2026-02-28', 'monthly')).toBe('2026-03-28');
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
