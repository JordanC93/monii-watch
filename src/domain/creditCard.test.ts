import { describe, expect, it } from 'vitest';
import { computeCreditCardSummary, utilizationStatus, totalCreditUtilization } from './creditCard';
import type { Account, Transaction } from './types';

const visa: Account = {
  id: 'v1', name: 'Visa', type: 'credit', closed: false, order: 0, createdAt: 0,
  creditLimit: 1000000, // $10,000
  apr: 0.20,
  paymentDueDay: 15,
  statementClosingDay: 25,
};

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't', accountId: 'v1', date: '2026-04-15', payeeId: 'p1',
    categoryId: null, transferAccountId: null, transferTransactionId: null,
    amount: 0, memo: '', cleared: 'cleared', flag: null, splits: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('computeCreditCardSummary', () => {
  it('balance owed is positive', () => {
    const s = computeCreditCardSummary(visa, [
      txn({ amount: -50000 }), // $500 charge
    ], '2026-04-26');
    expect(s.balanceOwed).toBe(50000);
    expect(s.balance).toBe(-50000);
  });

  it('utilization = balance / limit', () => {
    const s = computeCreditCardSummary(visa, [
      txn({ amount: -300000 }), // $3000 of $10000 = 30%
    ], '2026-04-26');
    expect(s.utilization).toBeCloseTo(0.30, 4);
    expect(s.availableCredit).toBe(700000);
  });

  it('utilization is null when no limit set', () => {
    const noLimit: Account = { ...visa, creditLimit: undefined };
    const s = computeCreditCardSummary(noLimit, [], '2026-04-26');
    expect(s.utilization).toBe(null);
  });

  it('interest projection = balance * APR / 12', () => {
    const s = computeCreditCardSummary(visa, [
      txn({ amount: -100000 }), // $1000 owed
    ], '2026-04-26');
    expect(s.interestProjection).toBe(Math.round(100000 * 0.20 / 12));
  });

  it('daysUntilDue rolls to next month when past', () => {
    // Today April 16, due day 15 → next due is May 15 (29 days)
    const s = computeCreditCardSummary(visa, [], '2026-04-16');
    expect(s.daysUntilDue).toBeGreaterThan(0);
    expect(s.daysUntilDue).toBeLessThan(35);
  });

  it('fullyConfigured requires all four metadata fields', () => {
    expect(computeCreditCardSummary(visa, [], '2026-04-26').fullyConfigured).toBe(true);
    const partial: Account = { ...visa, apr: undefined };
    expect(computeCreditCardSummary(partial, [], '2026-04-26').fullyConfigured).toBe(false);
  });
});

describe('utilizationStatus', () => {
  it('classifies in expected bands', () => {
    expect(utilizationStatus(null).label).toBe('No limit set');
    expect(utilizationStatus(0).label).toBe('Paid off');
    expect(utilizationStatus(0.05).label).toBe('Excellent');
    expect(utilizationStatus(0.25).label).toBe('Good');
    expect(utilizationStatus(0.45).label).toBe('Watch');
    expect(utilizationStatus(0.75).label).toBe('High');
    expect(utilizationStatus(1.10).label).toBe('Over limit');
  });
});

describe('totalCreditUtilization', () => {
  it('aggregates across cards', () => {
    const s1 = computeCreditCardSummary(visa, [txn({ amount: -100000 })], '2026-04-26');
    const s2 = computeCreditCardSummary(
      { ...visa, id: 'v2', creditLimit: 500000 },
      [txn({ amount: -50000, accountId: 'v2' })],
      '2026-04-26',
    );
    const tot = totalCreditUtilization([s1, s2]);
    expect(tot.totalBalance).toBe(150000);
    expect(tot.totalLimit).toBe(1500000);
    expect(tot.utilization).toBeCloseTo(0.10, 4);
  });
});
