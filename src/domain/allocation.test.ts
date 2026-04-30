import { describe, expect, it } from 'vitest';
import { evaluateAllocationRules, TRIGGER_LABELS } from './allocation';
import type { AllocationRule } from './types';

function rule(over: Partial<AllocationRule> = {}): AllocationRule {
  return {
    id: 'r' + Math.random().toString(36).slice(2, 8),
    trigger: 'paycheck',
    amount: 50000,
    targetCategoryId: 'c1',
    priority: 0,
    enabled: true,
    createdAt: 0,
    ...over,
  };
}

describe('evaluateAllocationRules — paycheck trigger', () => {
  it('fires for positive inflow', () => {
    const rules = [rule()];
    const moves = evaluateAllocationRules(rules, 'paycheck', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 100000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].cents).toBe(50000);
    expect(moves[0].targetCategoryId).toBe('c1');
  });

  it('does not fire for outflows', () => {
    const rules = [rule()];
    const moves = evaluateAllocationRules(rules, 'paycheck', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: -100000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(0);
  });

  it('does NOT dedup paycheck on same day (multiple paychecks valid)', () => {
    const rules = [rule({ lastFiredOn: '2026-04-29' })];
    const moves = evaluateAllocationRules(rules, 'paycheck', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 100000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(1);
  });

  it('respects priority order', () => {
    const rules = [
      rule({ id: 'low', priority: 10, amount: 10000 }),
      rule({ id: 'high', priority: 1, amount: 50000 }),
    ];
    const moves = evaluateAllocationRules(rules, 'paycheck', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 100000, date: '2026-04-29' },
    });
    expect(moves[0].ruleId).toBe('high');
    expect(moves[1].ruleId).toBe('low');
  });

  it('skips disabled rules', () => {
    const rules = [rule({ enabled: false })];
    const moves = evaluateAllocationRules(rules, 'paycheck', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 100000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(0);
  });
});

describe('evaluateAllocationRules — income-over trigger', () => {
  it('fires when amount >= threshold', () => {
    const rules = [rule({ trigger: 'income-over', threshold: 100000 })];
    const moves = evaluateAllocationRules(rules, 'income-over', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 150000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(1);
  });

  it('skips when below threshold', () => {
    const rules = [rule({ trigger: 'income-over', threshold: 100000 })];
    const moves = evaluateAllocationRules(rules, 'income-over', {
      today: '2026-04-29',
      month: '2026-04',
      triggerTxn: { amount: 50000, date: '2026-04-29' },
    });
    expect(moves).toHaveLength(0);
  });
});

describe('evaluateAllocationRules — monthly-1st trigger', () => {
  it('only fires on day 1', () => {
    const rules = [rule({ trigger: 'monthly-1st' })];
    const monthMid = evaluateAllocationRules(rules, 'monthly-1st', {
      today: '2026-04-15', month: '2026-04',
    });
    expect(monthMid).toHaveLength(0);

    const day1 = evaluateAllocationRules(rules, 'monthly-1st', {
      today: '2026-04-01', month: '2026-04',
    });
    expect(day1).toHaveLength(1);
  });

  it('dedupes within the same day', () => {
    const rules = [rule({ trigger: 'monthly-1st', lastFiredOn: '2026-04-01' })];
    const moves = evaluateAllocationRules(rules, 'monthly-1st', {
      today: '2026-04-01', month: '2026-04',
    });
    expect(moves).toHaveLength(0);
  });
});

describe('TRIGGER_LABELS', () => {
  it('has labels for all triggers', () => {
    expect(TRIGGER_LABELS.paycheck).toBeTruthy();
    expect(TRIGGER_LABELS['income-over']).toBeTruthy();
    expect(TRIGGER_LABELS['monthly-1st']).toBeTruthy();
  });
});
