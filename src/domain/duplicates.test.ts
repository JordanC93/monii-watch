import { describe, expect, it } from 'vitest';
import { findDuplicateOf, findDuplicateClusters } from './duplicates';
import type { Account, Payee, Transaction } from './types';
import type { TxnInput } from '../db/repo';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const payee: Payee = { id: 'p1', name: 'Starbucks' };

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8),
    accountId: 'a1',
    date: '2026-04-15',
    payeeId: 'p1',
    categoryId: null,
    transferAccountId: null,
    transferTransactionId: null,
    amount: -500,
    memo: '',
    cleared: 'cleared',
    flag: null,
    splits: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('findDuplicateOf', () => {
  it('matches exact same account+amount+date+payee', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-15', payee: 'Starbucks', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]?.existingId).toBe('e1');
  });

  it('tolerates ±$0.01 amount difference', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-15', payee: 'Starbucks', categoryId: null, amount: -501 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]).not.toBeNull();
  });

  it('tolerates ±2 day difference', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-17', payee: 'Starbucks', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]).not.toBeNull();
  });

  it('rejects 3+ day difference', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-19', payee: 'Starbucks', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]).toBeNull();
  });

  it('rejects different account', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a2', date: '2026-04-15', payee: 'Starbucks', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]).toBeNull();
  });

  it('handles substring payee match (Starbucks vs STARBUCKS STORE)', () => {
    const broader: Payee = { id: 'p1', name: 'STARBUCKS STORE #5821' };
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-15', payee: 'Starbucks', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [broader]);
    expect(out[0]).not.toBeNull();
  });

  it('rejects when payees clearly differ', () => {
    const existing = [txn({ id: 'e1', amount: -500, date: '2026-04-15' })];
    const inputs: TxnInput[] = [
      { accountId: 'a1', date: '2026-04-15', payee: 'Subway', categoryId: null, amount: -500 },
    ];
    const out = findDuplicateOf(inputs, existing, [payee]);
    expect(out[0]).toBeNull();
  });
});

describe('findDuplicateClusters', () => {
  it('groups two same-day same-amount-same-payee txns', () => {
    const txns = [
      txn({ id: 't1', amount: -500, date: '2026-04-15' }),
      txn({ id: 't2', amount: -500, date: '2026-04-15' }),
    ];
    const clusters = findDuplicateClusters(txns, [payee], [checking]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(['t1', 't2']);
  });

  it('returns nothing for genuinely distinct txns', () => {
    const txns = [
      txn({ id: 't1', amount: -500, date: '2026-04-15' }),
      txn({ id: 't2', amount: -500, date: '2026-04-25' }),
    ];
    const clusters = findDuplicateClusters(txns, [payee], [checking]);
    expect(clusters).toHaveLength(0);
  });
});
