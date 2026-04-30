import { describe, expect, it } from 'vitest';
import { computeCategoryInsight } from './insights';
import type { Account, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-04-15',
    payeeId: null, categoryId: 'c1', transferAccountId: null, transferTransactionId: null,
    amount: -1000, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('computeCategoryInsight', () => {
  it('classifies as new with <2 months of history', () => {
    const txns = [
      txn({ date: '2026-04-15', amount: -5000 }),
    ];
    const out = computeCategoryInsight('c1', [checking], txns, '2026-04');
    expect(out.band).toBe('new');
  });

  it('classifies as high when >25% over trailing avg', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: -10000 }),
      txn({ date: '2026-02-15', amount: -10000 }),
      txn({ date: '2026-03-15', amount: -10000 }),
      txn({ date: '2026-04-15', amount: -20000 }),
    ];
    const out = computeCategoryInsight('c1', [checking], txns, '2026-04');
    expect(out.band).toBe('high');
    expect(out.deltaPct).toBe(100);
  });

  it('classifies as low when >25% under', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: -10000 }),
      txn({ date: '2026-02-15', amount: -10000 }),
      txn({ date: '2026-03-15', amount: -10000 }),
      txn({ date: '2026-04-15', amount: -2000 }),
    ];
    const out = computeCategoryInsight('c1', [checking], txns, '2026-04');
    expect(out.band).toBe('low');
  });

  it('classifies as normal when within ±25%', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: -10000 }),
      txn({ date: '2026-02-15', amount: -10000 }),
      txn({ date: '2026-03-15', amount: -10000 }),
      txn({ date: '2026-04-15', amount: -11000 }),
    ];
    const out = computeCategoryInsight('c1', [checking], txns, '2026-04');
    expect(out.band).toBe('normal');
  });

  it('excludes one-time outliers', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: -10000 }),
      txn({ date: '2026-02-15', amount: -10000 }),
      txn({ date: '2026-03-15', amount: -10000 }),
      txn({ date: '2026-04-15', amount: -100000, oneTime: true }),
    ];
    const out = computeCategoryInsight('c1', [checking], txns, '2026-04');
    expect(out.thisMonth).toBe(0);
  });
});
