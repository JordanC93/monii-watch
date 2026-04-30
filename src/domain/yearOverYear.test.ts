import { describe, expect, it } from 'vitest';
import { computeYoY } from './yearOverYear';
import type { Account, Category, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const cat: Category = {
  id: 'c1', groupId: 'g1', name: 'Dining', color: null, emoji: null, order: 0, hidden: false,
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

describe('computeYoY', () => {
  it('compares this YTD vs same range last year', () => {
    const txns = [
      txn({ date: '2025-03-10', amount: -5000 }),  // last YTD
      txn({ date: '2026-03-10', amount: -10000 }), // this YTD
    ];
    const out = computeYoY([checking], [cat], txns, '2026-04-15');
    expect(out).toHaveLength(1);
    expect(out[0].thisYear).toBe(10000);
    expect(out[0].lastYear).toBe(5000);
    expect(out[0].diff).toBe(5000);
    expect(out[0].pctChange).toBe(1.0); // +100%
  });

  it('omits categories with no activity in either window', () => {
    const out = computeYoY([checking], [cat], [], '2026-04-15');
    expect(out).toHaveLength(0);
  });

  it('skips one-time outliers', () => {
    const txns = [
      txn({ date: '2026-03-10', amount: -5000 }),
      txn({ date: '2026-03-15', amount: -10000, oneTime: true }),
    ];
    const out = computeYoY([checking], [cat], txns, '2026-04-15');
    expect(out[0].thisYear).toBe(5000);
  });

  it('ignores transfers', () => {
    const txns = [
      txn({ date: '2026-03-10', amount: -5000 }),
      txn({ date: '2026-03-15', amount: -2000, transferAccountId: 'a2' }),
    ];
    const out = computeYoY([checking], [cat], txns, '2026-04-15');
    expect(out[0].thisYear).toBe(5000);
  });
});
