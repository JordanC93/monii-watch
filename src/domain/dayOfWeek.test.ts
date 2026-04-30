import { describe, expect, it } from 'vitest';
import { computeDayOfWeekSpend, parseDayOfWeek } from './dayOfWeek';
import type { Account, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-04-15',
    payeeId: null, categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: -1000, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('parseDayOfWeek', () => {
  it('maps ISO dates to 0..6 (Sun..Sat)', () => {
    // 2026-04-15 was a Wednesday
    expect(parseDayOfWeek('2026-04-15')).toBe(3);
    // 2026-04-19 was a Sunday
    expect(parseDayOfWeek('2026-04-19')).toBe(0);
    // 2026-04-18 was a Saturday
    expect(parseDayOfWeek('2026-04-18')).toBe(6);
  });
});

describe('computeDayOfWeekSpend', () => {
  it('returns 7 entries (Sun..Sat) even with no data', () => {
    const out = computeDayOfWeekSpend([checking], [], 90, '2026-04-15');
    expect(out).toHaveLength(7);
    expect(out[0].label).toBe('Sunday');
    expect(out[6].label).toBe('Saturday');
  });

  it('aggregates by day-of-week', () => {
    const txns = [
      txn({ date: '2026-04-15', amount: -1000 }),  // Wed
      txn({ date: '2026-04-15', amount: -2000 }),  // Wed
      txn({ date: '2026-04-18', amount: -3000 }),  // Sat
    ];
    const out = computeDayOfWeekSpend([checking], txns, 90, '2026-04-30');
    expect(out[3].totalCents).toBe(3000);
    expect(out[3].txnCount).toBe(2);
    expect(out[6].totalCents).toBe(3000);
    expect(out[6].txnCount).toBe(1);
  });

  it('skips inflows, transfers, one-time outliers', () => {
    const txns = [
      txn({ date: '2026-04-15', amount: 5000 }),                       // inflow
      txn({ date: '2026-04-15', amount: -1000, transferAccountId: 'a2' }),
      txn({ date: '2026-04-15', amount: -1000, oneTime: true }),
      txn({ date: '2026-04-15', amount: -2000 }),                      // counts
    ];
    const out = computeDayOfWeekSpend([checking], txns, 90, '2026-04-30');
    expect(out[3].totalCents).toBe(2000);
  });

  it('honors the lookback window', () => {
    const txns = [
      txn({ date: '2025-04-15', amount: -1000 }), // way out of window
      txn({ date: '2026-04-15', amount: -2000 }),
    ];
    const out = computeDayOfWeekSpend([checking], txns, 30, '2026-04-30');
    expect(out[3].totalCents).toBe(2000);
  });
});
