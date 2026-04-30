import { describe, expect, it } from 'vitest';
import { computeSafeSpend } from './safeSpend';
import type { Account, ScheduledTransaction, Settings, Transaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't', accountId: 'a1', date: '2026-04-15', payeeId: null,
    categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: 0, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const settings: Pick<Settings, 'payFrequency' | 'payAnchorDate'> = {
  payFrequency: 'biweekly',
  payAnchorDate: '2026-04-03',
};

describe('computeSafeSpend', () => {
  it('reports cash on hand and per-day spendable', () => {
    const txns = [
      txn({ amount: 100000 }), // $1000 in checking
    ];
    const spend = computeSafeSpend([checking], txns, [], settings, '2026-04-15');
    expect(spend.cashOnHand).toBe(100000);
    expect(spend.upcomingBills).toBe(0);
    expect(spend.spendable).toBe(100000);
    expect(spend.daysUntilPaycheck).toBeGreaterThan(0);
    expect(spend.perDay).toBeGreaterThan(0);
  });

  it('subtracts upcoming scheduled bills', () => {
    const txns = [txn({ amount: 100000 })];
    const scheduled: ScheduledTransaction[] = [
      {
        id: 's1', accountId: 'a1', payeeId: null, categoryId: null,
        transferAccountId: null, amount: -20000, memo: '', flag: null,
        frequency: 'monthly', startDate: '2026-04-16', nextDate: '2026-04-16',
        endDate: null, lastRunAt: null, paused: false, createdAt: 0, updatedAt: 0,
      },
    ];
    const spend = computeSafeSpend([checking], txns, scheduled, settings, '2026-04-15');
    expect(spend.upcomingBills).toBe(20000);
    expect(spend.spendable).toBe(80000);
  });

  it('returns ready=false with no balances', () => {
    const spend = computeSafeSpend([checking], [], [], settings, '2026-04-15');
    expect(spend.ready).toBe(false);
  });

  it('does not count credit cards as cash', () => {
    const cc: Account = { ...checking, id: 'cc', type: 'credit' };
    const txns = [
      txn({ amount: 100000, accountId: 'a1' }),
      txn({ amount: 50000, accountId: 'cc' }), // credit positive doesn't count
    ];
    const spend = computeSafeSpend([checking, cc], txns, [], settings, '2026-04-15');
    expect(spend.cashOnHand).toBe(100000);
  });
});
