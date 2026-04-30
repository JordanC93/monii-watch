import { describe, expect, it } from 'vitest';
import {
  todayIso, monthIso, thisMonthIso, parseMonth, shiftMonth, monthRange,
  isoIsInMonth, monthsBetween, formatMonthLong, formatMonthShort,
  formatDate, formatDateShort, isoAddDays, isoBetween,
} from './date';

describe('date helpers', () => {
  it('todayIso returns yyyy-mm-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('monthIso converts a Date to yyyy-mm', () => {
    expect(monthIso(new Date(2026, 3, 15))).toBe('2026-04');
  });
  it('monthIso accepts an ISO string', () => {
    expect(monthIso('2026-04-15')).toBe('2026-04');
  });
  it('thisMonthIso returns yyyy-mm', () => {
    expect(thisMonthIso()).toMatch(/^\d{4}-\d{2}$/);
  });
  it('parseMonth produces a Date for the first of the month', () => {
    const d = parseMonth('2026-04');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(1);
  });
});

describe('shiftMonth', () => {
  it('shifts forward', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('shifts backward', () => {
    expect(shiftMonth('2026-02', -1)).toBe('2026-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('shifts by multiple months', () => {
    expect(shiftMonth('2026-01', 12)).toBe('2027-01');
    expect(shiftMonth('2026-06', -6)).toBe('2025-12');
  });
});

describe('monthRange', () => {
  it('returns first + last day for 30-day month', () => {
    const r = monthRange('2026-04');
    expect(r.start).toBe('2026-04-01');
    expect(r.end).toBe('2026-04-30');
  });
  it('handles February non-leap', () => {
    const r = monthRange('2026-02');
    expect(r.end).toBe('2026-02-28');
  });
});

describe('isoIsInMonth', () => {
  it('matches by month prefix', () => {
    expect(isoIsInMonth('2026-04-15', '2026-04')).toBe(true);
    expect(isoIsInMonth('2026-05-01', '2026-04')).toBe(false);
  });
});

describe('monthsBetween', () => {
  it('counts forward months', () => {
    expect(monthsBetween('2026-01', '2026-04')).toBe(3);
    expect(monthsBetween('2026-01', '2027-01')).toBe(12);
  });
  it('returns negative for backward span', () => {
    expect(monthsBetween('2026-04', '2026-01')).toBe(-3);
  });
});

describe('formatters', () => {
  it('formatMonthLong', () => {
    expect(formatMonthLong('2026-04')).toBe('April 2026');
  });
  it('formatMonthShort', () => {
    expect(formatMonthShort('2026-04')).toBe('Apr 2026');
  });
  it('formatDate / formatDateShort', () => {
    expect(formatDate('2026-04-15')).toBe('Apr 15, 2026');
    expect(formatDateShort('2026-04-15')).toBe('Apr 15');
  });
});

describe('isoAddDays', () => {
  it('adds positive days', () => {
    expect(isoAddDays('2026-04-15', 5)).toBe('2026-04-20');
  });
  it('subtracts negative days', () => {
    expect(isoAddDays('2026-04-15', -5)).toBe('2026-04-10');
  });
  it('handles month boundary', () => {
    expect(isoAddDays('2026-04-30', 1)).toBe('2026-05-01');
  });
});

describe('isoBetween', () => {
  it('inclusive range check', () => {
    expect(isoBetween('2026-04-15', '2026-04-01', '2026-04-30')).toBe(true);
    expect(isoBetween('2026-04-01', '2026-04-01', '2026-04-30')).toBe(true);
    expect(isoBetween('2026-04-30', '2026-04-01', '2026-04-30')).toBe(true);
    expect(isoBetween('2026-05-01', '2026-04-01', '2026-04-30')).toBe(false);
  });
});
