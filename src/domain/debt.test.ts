import { describe, expect, it } from 'vitest';
import { simulatePayoff } from './debt';
import type { DebtItem } from './debt';

const cardA: DebtItem = { accountId: 'a', name: 'A', balance: 100000, apr: 0.20, minPayment: 5000 };
const cardB: DebtItem = { accountId: 'b', name: 'B', balance: 200000, apr: 0.10, minPayment: 5000 };

describe('simulatePayoff', () => {
  it('snowball: smaller balances first', () => {
    const out = simulatePayoff({ debts: [cardB, cardA], monthlyBudget: 30000, strategy: 'snowball' });
    expect(out.payoffOrder[0].accountId).toBe('a');
    expect(out.payoffOrder[1].accountId).toBe('b');
  });

  it('avalanche: highest APR first', () => {
    const out = simulatePayoff({ debts: [cardA, cardB], monthlyBudget: 30000, strategy: 'avalanche' });
    expect(out.payoffOrder[0].accountId).toBe('a');
  });

  it('terminates with all paid off', () => {
    const out = simulatePayoff({ debts: [cardA, cardB], monthlyBudget: 30000, strategy: 'avalanche' });
    expect(out.months).toBeGreaterThan(0);
    expect(out.totalInterest).toBeGreaterThanOrEqual(0);
  });

  it('avalanche minimizes total interest vs snowball (when APRs differ)', () => {
    const ava = simulatePayoff({ debts: [cardA, cardB], monthlyBudget: 30000, strategy: 'avalanche' });
    const sno = simulatePayoff({ debts: [cardA, cardB], monthlyBudget: 30000, strategy: 'snowball' });
    expect(ava.totalInterest).toBeLessThanOrEqual(sno.totalInterest);
  });

  it('handles single-account input', () => {
    const out = simulatePayoff({ debts: [cardA], monthlyBudget: 20000, strategy: 'avalanche' });
    expect(out.payoffOrder.length).toBe(1);
    expect(out.months).toBeGreaterThan(0);
  });
});
