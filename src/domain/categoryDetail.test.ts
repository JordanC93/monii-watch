import { describe, expect, it } from 'vitest';
import { computeCategoryDetail, formatMonthShort } from './categoryDetail';
import type { Account, Payee, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-04-15',
    payeeId: 'p1', categoryId: 'c1', transferAccountId: null, transferTransactionId: null,
    amount: -1000, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('computeCategoryDetail', () => {
  it('returns 12 monthly slots', () => {
    const out = computeCategoryDetail('c1', [checking], [], [], '2026-04-15');
    expect(out.monthly).toHaveLength(12);
    expect(out.monthlyLastYear).toHaveLength(12);
  });

  it('aggregates spending per month', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: -5000 }),
      txn({ date: '2026-02-15', amount: -10000 }),
      txn({ date: '2026-04-15', amount: -8000 }),
    ];
    const out = computeCategoryDetail('c1', [checking], txns, [], '2026-04-15');
    const apr = out.monthly.find((m) => m.month === '2026-04');
    expect(apr!.cents).toBe(8000);
  });

  it('finds variability (max/min/median)', () => {
    const txns = [
      txn({ date: '2025-08-15', amount: -10000 }),  // 10000
      txn({ date: '2025-09-15', amount: -20000 }),  // 20000
      txn({ date: '2026-01-15', amount: -15000 }),  // 15000
      txn({ date: '2026-04-15', amount: -25000 }),  // 25000 max
    ];
    const out = computeCategoryDetail('c1', [checking], txns, [], '2026-04-15');
    expect(out.stats.max).toBe(25000);
    expect(out.stats.min).toBe(10000);
    expect(out.stats.activeMonths).toBe(4);
  });

  it('YTD comparison this vs last year', () => {
    const txns = [
      txn({ date: '2025-03-10', amount: -5000 }),
      txn({ date: '2026-03-10', amount: -10000 }),
    ];
    const out = computeCategoryDetail('c1', [checking], txns, [], '2026-04-15');
    expect(out.yoy.thisYear).toBe(10000);
    expect(out.yoy.lastYear).toBe(5000);
  });

  it('groups top payees', () => {
    const payees: Payee[] = [
      { id: 'p1', name: 'Con Edison' },
      { id: 'p2', name: 'PG&E' },
    ];
    const txns = [
      txn({ payeeId: 'p1', date: '2026-01-15', amount: -10000 }),
      txn({ payeeId: 'p1', date: '2026-02-15', amount: -10000 }),
      txn({ payeeId: 'p2', date: '2026-03-15', amount: -5000 }),
    ];
    const out = computeCategoryDetail('c1', [checking], txns, payees, '2026-04-15');
    expect(out.topPayees[0].payeeName).toBe('Con Edison');
    expect(out.topPayees[0].cents).toBe(20000);
  });
});

describe('formatMonthShort', () => {
  it('formats yyyy-mm to MMM YY', () => {
    expect(formatMonthShort('2026-04')).toBe('Apr 26');
    expect(formatMonthShort('2025-12')).toBe('Dec 25');
  });
});
