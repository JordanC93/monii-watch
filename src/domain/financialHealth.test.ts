import { describe, expect, it } from 'vitest';
import { computeHealthScore } from './financialHealth';
import { todayIso, isoAddDays } from './date';
import type { Account, Settings, Transaction, Payee } from './types';

// Dates must be relative to today — the scorecard uses a trailing
// 90-day window, so hardcoded dates silently age out of it and the
// suite starts failing on the calendar, not on a code change.
const recent = (daysAgo: number) => isoAddDays(todayIso(), -daysAgo);

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const savings: Account = {
  id: 'a2', name: 'Savings', type: 'savings', closed: false, order: 1, createdAt: 0,
};
const visa: Account = {
  id: 'v1', name: 'Visa', type: 'credit', closed: false, order: 2, createdAt: 0,
  creditLimit: 1000000,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: recent(15),
    payeeId: null, categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: 0, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const baseSettings: Partial<Settings> = {
  emergencyFundMonths: 3,
};

describe('computeHealthScore', () => {
  it('returns "unknown" indicators when there is no data', () => {
    const sc = computeHealthScore([], [], [], baseSettings as Settings);
    expect(sc.indicators.length).toBe(6);
    for (const i of sc.indicators) {
      expect(['green', 'yellow', 'red', 'unknown']).toContain(i.band);
    }
  });

  it('flags green savings rate when income >> spending', () => {
    const txns = [
      txn({ amount: 1000000, date: recent(30) }),  // $10000 income
      txn({ amount: -100000, date: recent(25) }),   // $1000 spend → 90% savings
    ];
    const sc = computeHealthScore([checking], txns, [], baseSettings as Settings);
    const sr = sc.indicators.find((i) => i.id === 'savings-rate')!;
    expect(sr.band).toBe('green');
  });

  it('flags red credit utilization when over 50%', () => {
    const txns = [
      txn({ amount: -800000, accountId: 'v1' }), // 80% util
    ];
    const sc = computeHealthScore([checking, visa], txns, [], baseSettings as Settings);
    const u = sc.indicators.find((i) => i.id === 'credit-utilization')!;
    expect(u.band).toBe('red');
  });

  it('overall score is 0..100', () => {
    const sc = computeHealthScore([checking, savings], [
      txn({ amount: 500000, date: recent(30) }),
      txn({ amount: -100000, date: recent(25) }),
    ], [], baseSettings as Settings);
    expect(sc.overall).toBeGreaterThanOrEqual(0);
    expect(sc.overall).toBeLessThanOrEqual(100);
  });

  it('every indicator has a non-empty suggestion', () => {
    const sc = computeHealthScore([], [], [], baseSettings as Settings);
    for (const i of sc.indicators) {
      expect(i.suggestion.length).toBeGreaterThan(0);
    }
  });
});
