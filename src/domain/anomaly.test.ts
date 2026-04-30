import { describe, expect, it } from 'vitest';
import { detectAnomalies } from './anomaly';
import type { Transaction } from './types';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2, 8),
    accountId: 'a1',
    date: '2026-04-15',
    payeeId: 'p1',
    categoryId: null,
    transferAccountId: null,
    transferTransactionId: null,
    amount: 0,
    memo: '',
    cleared: 'cleared',
    flag: null,
    splits: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('detectAnomalies', () => {
  it('returns nothing without enough history', () => {
    const out = detectAnomalies([
      txn({ payeeId: 'p1', amount: -10000, date: '2026-04-29' }),
    ], { today: '2026-04-29' });
    expect(out).toHaveLength(0);
  });

  it('flags a 3x median spike for a regular payee', () => {
    const txns = [
      // Prior 5 charges around $5
      txn({ payeeId: 'p1', amount: -500, date: '2026-04-01' }),
      txn({ payeeId: 'p1', amount: -500, date: '2026-04-05' }),
      txn({ payeeId: 'p1', amount: -500, date: '2026-04-10' }),
      txn({ payeeId: 'p1', amount: -500, date: '2026-04-15' }),
      txn({ payeeId: 'p1', amount: -500, date: '2026-04-20' }),
      // Today: $30 — anomaly
      txn({ payeeId: 'p1', amount: -3000, date: '2026-04-29' }),
    ];
    const out = detectAnomalies(txns, { today: '2026-04-29' });
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(3000);
    expect(out[0].priors).toBe(5);
  });

  it('ignores small-dollar spikes (<$20)', () => {
    const txns = [
      ...Array(5).fill(0).map(() => txn({ payeeId: 'p1', amount: -100, date: '2026-04-01' })),
      txn({ payeeId: 'p1', amount: -1500, date: '2026-04-29' }), // 15× but under $20
    ];
    const out = detectAnomalies(txns, { today: '2026-04-29' });
    expect(out).toHaveLength(0);
  });

  it('skips transfers', () => {
    const txns = [
      ...Array(5).fill(0).map(() => txn({ payeeId: 'p1', amount: -500, date: '2026-04-01' })),
      txn({ payeeId: 'p1', amount: -3000, date: '2026-04-29', transferAccountId: 'a2' }),
    ];
    const out = detectAnomalies(txns, { today: '2026-04-29' });
    expect(out).toHaveLength(0);
  });

  it('skips one-time outliers', () => {
    const txns = [
      ...Array(5).fill(0).map(() => txn({ payeeId: 'p1', amount: -500, date: '2026-04-01' })),
      txn({ payeeId: 'p1', amount: -3000, date: '2026-04-29', oneTime: true }),
    ];
    const out = detectAnomalies(txns, { today: '2026-04-29' });
    expect(out).toHaveLength(0);
  });

  it('ignores normal-amount charges', () => {
    const txns = [
      ...Array(5).fill(0).map((_, i) => txn({ payeeId: 'p1', amount: -5000, date: `2026-04-${String(i + 1).padStart(2, '0')}` })),
      txn({ payeeId: 'p1', amount: -5100, date: '2026-04-29' }), // within 2% of mean
    ];
    const out = detectAnomalies(txns, { today: '2026-04-29' });
    expect(out).toHaveLength(0);
  });
});
