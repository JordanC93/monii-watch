import { describe, expect, it } from 'vitest';
import { detectSubscriptions, annualCost, detectRecurringForPayee, detectSubscriptionCreep } from './subscriptions';
import type { Account, Payee, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const payee: Payee = { id: 'p1', name: 'Netflix' };

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8), accountId: 'a1', date: '2026-04-15',
    payeeId: 'p1', categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: -1599, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('detectSubscriptions', () => {
  it('detects monthly subscription with consistent amount', () => {
    const txns = [
      txn({ date: '2026-01-15' }),
      txn({ date: '2026-02-15' }),
      txn({ date: '2026-03-15' }),
      txn({ date: '2026-04-15' }),
    ];
    const subs = detectSubscriptions(txns, [payee], [checking]);
    expect(subs).toHaveLength(1);
    expect(subs[0].cadence).toBe('monthly');
    expect(subs[0].occurrences).toBe(4);
  });

  it('predictedNext is the last date plus the cadence period, as a calendar date', () => {
    const txns = [
      txn({ date: '2026-01-15' }),
      txn({ date: '2026-02-15' }),
      txn({ date: '2026-03-15' }),
      txn({ date: '2026-04-15' }),
    ];
    const subs = detectSubscriptions(txns, [payee], [checking]);
    expect(subs[0].predictedNext).toBe('2026-05-15'); // Apr 15 + 30 days
  });

  it('skips when fewer than minOccurrences', () => {
    const txns = [txn()];
    expect(detectSubscriptions(txns, [payee], [checking])).toHaveLength(0);
  });

  it('handles weekly cadence', () => {
    const txns = [
      txn({ date: '2026-04-01' }),
      txn({ date: '2026-04-08' }),
      txn({ date: '2026-04-15' }),
      txn({ date: '2026-04-22' }),
    ];
    const subs = detectSubscriptions(txns, [payee], [checking]);
    expect(subs[0].cadence).toBe('weekly');
  });

  it('skips transfers', () => {
    const txns = [
      txn({ date: '2026-01-15', transferAccountId: 'a2' }),
      txn({ date: '2026-02-15', transferAccountId: 'a2' }),
      txn({ date: '2026-03-15', transferAccountId: 'a2' }),
    ];
    expect(detectSubscriptions(txns, [payee], [checking])).toHaveLength(0);
  });

  it('skips inflows', () => {
    const txns = [
      txn({ date: '2026-01-15', amount: 1000 }),
      txn({ date: '2026-02-15', amount: 1000 }),
      txn({ date: '2026-03-15', amount: 1000 }),
    ];
    expect(detectSubscriptions(txns, [payee], [checking])).toHaveLength(0);
  });
});

describe('annualCost', () => {
  it('multiplies by per-year factor', () => {
    expect(annualCost({
      payeeId: 'p1', payeeName: 'Test', accountId: 'a1', accountName: '', categoryId: null,
      averageAmount: 1000, cadence: 'monthly', occurrences: 4, firstDate: '', lastDate: '', predictedNext: '', transactionIds: [],
    })).toBe(12000);
  });
});

describe('detectRecurringForPayee', () => {
  it('detects pattern after 3+ similar charges', () => {
    const txns = [
      txn({ date: '2026-01-15' }),
      txn({ date: '2026-02-15' }),
      txn({ date: '2026-03-15' }),
    ];
    expect(detectRecurringForPayee('p1', -1599, txns, [])).toBe('monthly');
  });

  it('returns null when scheduled template already exists', () => {
    const txns = [
      txn({ date: '2026-01-15' }),
      txn({ date: '2026-02-15' }),
      txn({ date: '2026-03-15' }),
    ];
    expect(detectRecurringForPayee('p1', -1599, txns, [{ payeeId: 'p1' }])).toBe(null);
  });
});

describe('detectSubscriptionCreep', () => {
  it('flags ≥10% increase quarter-over-quarter', () => {
    const today = new Date();
    const recent = (offsetDays: number) => {
      const d = new Date(today); d.setDate(d.getDate() - offsetDays);
      return d.toISOString().slice(0, 10);
    };
    const txns = [
      txn({ date: recent(150), amount: -1000 }),
      txn({ date: recent(120), amount: -1000 }),
      txn({ date: recent(60),  amount: -1500 }),
      txn({ date: recent(30),  amount: -1500 }),
    ];
    const sub = {
      payeeId: 'p1', payeeName: 'Netflix', accountId: 'a1', accountName: '', categoryId: null,
      averageAmount: 1500, cadence: 'monthly' as const, occurrences: 4,
      firstDate: '', lastDate: '', predictedNext: '', transactionIds: [],
    };
    const creep = detectSubscriptionCreep([sub], txns);
    expect(creep).toHaveLength(1);
    expect(creep[0].pctChange).toBeGreaterThanOrEqual(0.10);
  });

  it('ignores tracking-account outflows when accounts are provided', () => {
    const brokerage: Account = {
      id: 'a2', name: 'Brokerage', type: 'investment', closed: false, order: 1, createdAt: 0,
    };
    const today = new Date();
    const recent = (offsetDays: number) => {
      const d = new Date(today); d.setDate(d.getDate() - offsetDays);
      return d.toISOString().slice(0, 10);
    };
    // On-budget charges hold steady at $10; a same-payee tracking-account
    // outflow in the current quarter would fake a >10% "increase".
    const txns = [
      txn({ date: recent(150), amount: -1000 }),
      txn({ date: recent(120), amount: -1000 }),
      txn({ date: recent(60),  amount: -1000 }),
      txn({ date: recent(30),  amount: -1000 }),
      txn({ date: recent(20),  amount: -50000, accountId: 'a2' }),
    ];
    const sub = {
      payeeId: 'p1', payeeName: 'Netflix', accountId: 'a1', accountName: '', categoryId: null,
      averageAmount: 1000, cadence: 'monthly' as const, occurrences: 4,
      firstDate: '', lastDate: '', predictedNext: '', transactionIds: [],
    };
    // Without the account filter the tracking outflow skews the quarter avg.
    expect(detectSubscriptionCreep([sub], txns)).toHaveLength(1);
    // With it, the price is flat — no creep.
    expect(detectSubscriptionCreep([sub], txns, [checking, brokerage])).toHaveLength(0);
  });
});
