import { describe, expect, it } from 'vitest';
import { computeGoalProjection } from './goalProjection';
import type { Category, CategoryGoal } from './types';

function cat(goal: CategoryGoal): Category {
  return {
    id: 'c1', groupId: 'g1', name: 'Vacation', color: null, emoji: null,
    order: 0, hidden: false, goal,
  };
}

const TARGET: CategoryGoal = { type: 'targetBalance', amount: 100000 };

describe('computeGoalProjection', () => {
  it('returns null for categories without a projectable goal', () => {
    expect(computeGoalProjection(cat({ type: 'monthlyFunding', amount: 5000 }), 0, [], [], '2026-06')).toBe(null);
  });

  it('computes ratio from available / target', () => {
    const out = computeGoalProjection(cat(TARGET), 25000, [], [], '2026-06');
    expect(out).not.toBe(null);
    expect(out!.ratio).toBeCloseTo(0.25);
    expect(out!.currentAmount).toBe(25000);
    expect(out!.remainingAmount).toBe(75000);
  });

  it('clamps ratio to 0 when the envelope is overspent (negative available)', () => {
    const out = computeGoalProjection(cat(TARGET), -5000, [], [], '2026-06');
    expect(out).not.toBe(null);
    expect(out!.ratio).toBe(0);
    expect(out!.currentAmount).toBe(0);
    expect(out!.remainingAmount).toBe(100000);
  });

  it('preserves a raw ratio above 1 when overfunded', () => {
    const out = computeGoalProjection(cat(TARGET), 150000, [], [], '2026-06');
    expect(out!.ratio).toBeCloseTo(1.5);
    expect(out!.remainingAmount).toBe(0);
    expect(out!.monthsToFinish).toBe(0);
  });

  it('projects completion from the trailing assignment rate', () => {
    const assignments = [
      { id: '2026-06|c1', month: '2026-06', categoryId: 'c1', assigned: 10000 },
      { id: '2026-05|c1', month: '2026-05', categoryId: 'c1', assigned: 10000 },
      { id: '2026-04|c1', month: '2026-04', categoryId: 'c1', assigned: 10000 },
    ];
    const out = computeGoalProjection(cat(TARGET), 40000, assignments, [], '2026-06');
    expect(out!.monthlyRate).toBe(10000);
    expect(out!.monthsToFinish).toBe(6); // 60000 remaining / 10000 per month
    expect(out!.projectedDate).toBe('2026-12-01');
  });
});
