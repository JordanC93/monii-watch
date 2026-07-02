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

  it('rolls freed minimum payments into the extra pool after a debt retires', () => {
    const small: DebtItem = { accountId: 's', name: 'S', balance: 10000, apr: 0, minPayment: 10000 };
    const big: DebtItem = { accountId: 'b', name: 'B', balance: 60000, apr: 0, minPayment: 10000 };
    const out = simulatePayoff({ debts: [small, big], monthlyBudget: 20000, strategy: 'snowball' });
    // Month 1 retires S; its $100 minimum then accelerates B:
    // 50000 → 30000 → 10000 → 0. Without the roll-forward this takes 6 months.
    expect(out.months).toBe(4);
    expect(out.payoffOrder.map((d) => d.accountId)).toEqual(['s', 'b']);
  });

  it('handles single-account input', () => {
    const out = simulatePayoff({ debts: [cardA], monthlyBudget: 20000, strategy: 'avalanche' });
    expect(out.payoffOrder.length).toBe(1);
    expect(out.months).toBeGreaterThan(0);
  });
});
