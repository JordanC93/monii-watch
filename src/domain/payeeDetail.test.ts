import { describe, expect, it } from 'vitest';
import { computePayeeDetail } from './payeeDetail';
import type { Account, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const brokerage: Account = {
  id: 'a2', name: 'Brokerage', type: 'investment', closed: false, order: 1, createdAt: 0,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-06-01',
    payeeId: 'p1', categoryId: 'c1', transferAccountId: null, transferTransactionId: null,
    amount: -5000, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const TODAY = '2026-06-15';

describe('computePayeeDetail', () => {
  it('aggregates monthly spend from outflows only', () => {
    const txns = [
      txn({ date: '2026-06-01', amount: -5000 }),
      txn({ date: '2026-05-10', amount: -3000 }),
      txn({ date: '2026-06-05', amount: 2000 }), // refund — must not pad spend
    ];
    const out = computePayeeDetail('p1', [checking], txns, [], TODAY);
    const total = out.monthly.reduce((s, m) => s + m.cents, 0);
    expect(total).toBe(8000);
    expect(out.yoy.thisYear).toBe(8000);
  });

  it('includes refunds / inflows in the recent transactions list', () => {
    const txns = [
      txn({ id: 'spend', date: '2026-06-01', amount: -5000 }),
      txn({ id: 'refund', date: '2026-06-05', amount: 2000 }),
    ];
    const out = computePayeeDetail('p1', [checking], txns, [], TODAY);
    expect(out.recent).toHaveLength(2);
    // Sorted newest first — the refund is the most recent entry.
    expect(out.recent[0].id).toBe('refund');
    expect(out.recent[0].amount).toBe(2000);
    expect(out.recent[1].id).toBe('spend');
  });

  it('excludes tracking-account and other-payee transactions everywhere', () => {
    const txns = [
      txn({ date: '2026-06-01', amount: -5000 }),
      txn({ date: '2026-06-02', amount: -9000, accountId: 'a2' }), // tracking
      txn({ date: '2026-06-03', amount: -7000, payeeId: 'p2' }),   // other payee
    ];
    const out = computePayeeDetail('p1', [checking, brokerage], txns, [], TODAY);
    expect(out.recent).toHaveLength(1);
    expect(out.monthly.reduce((s, m) => s + m.cents, 0)).toBe(5000);
  });

  it('counts inflows toward lifetime visit count but not lifetime spend', () => {
    const txns = [
      txn({ date: '2026-06-01', amount: -5000 }),
      txn({ date: '2026-06-05', amount: 2000 }),
    ];
    const out = computePayeeDetail('p1', [checking], txns, [], TODAY);
    expect(out.stats.lifetimeCount).toBe(2);
    expect(out.stats.lifetimeCents).toBe(5000);
  });
});
