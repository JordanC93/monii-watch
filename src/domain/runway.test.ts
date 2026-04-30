import { describe, expect, it } from 'vitest';
import { computeRunway, computeSavingsRateTrend } from './runway';
import type { Account, Transaction } from './types';

const checking: Account = { id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0 };
const savings: Account = { id: 'a2', name: 'Savings', type: 'savings', closed: false, order: 1, createdAt: 0 };
const credit: Account = { id: 'a3', name: 'Visa', type: 'credit', closed: false, order: 2, createdAt: 0 };

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-04-15',
    payeeId: null, categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: 0, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('computeRunway', () => {
  it('returns null months when burn is 0', () => {
    const r = computeRunway([checking], [
      txn({ date: '2026-04-15', amount: 100000 }),
    ], 6, '2026-04-30');
    expect(r.monthsRunway).toBe(null);
  });

  it('cash on hand counts only liquid accounts', () => {
    const r = computeRunway([checking, savings, credit], [
      txn({ accountId: 'a1', amount: 100000 }),
      txn({ accountId: 'a2', amount: 200000 }),
      txn({ accountId: 'a3', amount: 50000 }), // credit positive doesn't count
    ], 6, '2026-04-30');
    expect(r.cashOnHand).toBe(300000);
  });

  it('runway = cash / monthly burn', () => {
    const r = computeRunway([checking], [
      txn({ accountId: 'a1', amount: 1200000, date: '2026-04-01' }),  // $12000 cash
      // 6 months of $1000/mo outflow
      txn({ accountId: 'a1', date: '2025-11-15', amount: -100000 }),
      txn({ accountId: 'a1', date: '2025-12-15', amount: -100000 }),
      txn({ accountId: 'a1', date: '2026-01-15', amount: -100000 }),
      txn({ accountId: 'a1', date: '2026-02-15', amount: -100000 }),
      txn({ accountId: 'a1', date: '2026-03-15', amount: -100000 }),
      txn({ accountId: 'a1', date: '2026-04-15', amount: -100000 }),
    ], 6, '2026-04-30');
    expect(r.monthlyBurnAvg).toBe(100000);
    expect(r.monthsRunway).toBeCloseTo(6, 1); // ~6 months
  });

  it('skips one-time outliers from burn', () => {
    const r = computeRunway([checking], [
      txn({ accountId: 'a1', date: '2026-04-15', amount: -1000000, oneTime: true }),
      txn({ accountId: 'a1', date: '2026-03-15', amount: -100000 }),
    ], 6, '2026-04-30');
    expect(r.monthlyBurnAvg).toBeLessThan(20000); // wouldn't be if we counted the $10k outlier
  });
});

describe('computeSavingsRateTrend', () => {
  it('returns 12 entries by default', () => {
    const out = computeSavingsRateTrend([checking], [], 12, '2026-04-30');
    expect(out).toHaveLength(12);
  });

  it('rate is null for months with no income', () => {
    const out = computeSavingsRateTrend([checking], [
      txn({ date: '2026-04-15', amount: -5000 }),
    ], 12, '2026-04-30');
    const apr = out.find((p) => p.month === '2026-04');
    expect(apr?.rate).toBe(null);
  });

  it('rate is positive when income exceeds spending', () => {
    const out = computeSavingsRateTrend([checking], [
      txn({ date: '2026-04-01', amount: 100000 }),
      txn({ date: '2026-04-15', amount: -20000 }),
    ], 12, '2026-04-30');
    const apr = out.find((p) => p.month === '2026-04');
    expect(apr?.rate).toBeCloseTo(0.8, 2);
  });
});
