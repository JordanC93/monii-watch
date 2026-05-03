import { describe, expect, it } from 'vitest';
import { computeGoalProgress } from './goals';
import { computeGoalProjection } from './goalProjection';
import type { Category, MonthAssignment } from './types';

function cat(over: Partial<Category> = {}): Category {
  return {
    id: 'c1', groupId: 'g1', name: 'Goal',
    color: null, emoji: null, order: 0, hidden: false,
    ...over,
  };
}

describe('computeGoalProgress — monthlyFunding', () => {
  it('hits funded at exact target', () => {
    const c = cat({ goal: { type: 'monthlyFunding', amount: 50000 } });
    const p = computeGoalProgress(c, '2026-04', 50000, 50000);
    expect(p.status).toBe('funded');
  });

  it('marks underfunded', () => {
    const c = cat({ goal: { type: 'monthlyFunding', amount: 50000 } });
    const p = computeGoalProgress(c, '2026-04', 30000, 30000);
    expect(p.status).toBe('underfunded');
  });

  it('marks overfunded above target', () => {
    const c = cat({ goal: { type: 'monthlyFunding', amount: 50000 } });
    const p = computeGoalProgress(c, '2026-04', 70000, 70000);
    expect(p.status).toBe('overfunded');
  });
});

describe('computeGoalProgress — targetBalance', () => {
  it('funded when available reaches target', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 100000 } });
    const p = computeGoalProgress(c, '2026-04', 0, 100000);
    expect(p.status).toBe('funded');
  });
});

describe('computeGoalProgress — annual', () => {
  it('funded when available reaches annual target', () => {
    const c = cat({ goal: { type: 'annual', amount: 60000, annualMonth: 12, annualDay: 15 } });
    const p = computeGoalProgress(c, '2026-04', 5000, 60000);
    expect(p.status).toBe('funded');
  });
});

describe('computeGoalProjection', () => {
  it('returns null for categories without a purchase goal', () => {
    const c = cat({ goal: { type: 'monthlyFunding', amount: 50000 } });
    expect(computeGoalProjection(c, 0, [])).toBe(null);
  });

  it('projects completion date based on monthly rate', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 200000 } });
    const assignments: MonthAssignment[] = [
      { id: '2026-04|c1', month: '2026-04', categoryId: 'c1', assigned: 50000 },
    ];
    const proj = computeGoalProjection(c, 50000, assignments, [], '2026-04');
    expect(proj!.monthlyRate).toBe(50000);
    expect(proj!.monthsToFinish).toBe(3); // 200k - 50k = 150k / 50k = 3 months
  });

  it('100% when remaining is 0', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 100000 } });
    const proj = computeGoalProjection(c, 100000, [], [], '2026-04');
    expect(proj!.remainingAmount).toBe(0);
    expect(proj!.monthsToFinish).toBe(0);
  });

  it('uses scheduled-transfer rate as the saving pace when no actual history exists', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 240000 } });
    const scheduled = [
      // $200/mo auto-deposit wired to this goal via autoAssignCategoryId
      {
        id: 'sch1', accountId: 'a1', payeeId: null, categoryId: null,
        transferAccountId: null, amount: 20000, memo: '', flag: null,
        frequency: 'monthly' as const, startDate: '2026-04-01',
        nextDate: '2026-05-01', endDate: null, lastRunAt: null,
        paused: false, autoAssignCategoryId: 'c1',
        createdAt: 0, updatedAt: 0,
      },
    ];
    const proj = computeGoalProjection(c, 0, [], scheduled, '2026-04');
    expect(proj!.scheduledMonthlyRate).toBe(20000);
    expect(proj!.scheduledMonthsToFinish).toBe(12); // 240k / 20k = 12
    // No history → falls back to scheduled rate for the headline projection too
    expect(proj!.monthlyRate).toBe(20000);
  });

  it('weekly scheduled transfers convert to monthly rate', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 100000 } });
    const scheduled = [
      {
        id: 'sch1', accountId: 'a1', payeeId: null, categoryId: null,
        transferAccountId: null, amount: 5000, memo: '', flag: null,
        frequency: 'weekly' as const, startDate: '2026-04-01',
        nextDate: '2026-04-08', endDate: null, lastRunAt: null,
        paused: false, autoAssignCategoryId: 'c1',
        createdAt: 0, updatedAt: 0,
      },
    ];
    const proj = computeGoalProjection(c, 0, [], scheduled, '2026-04');
    // $50 * ~4.348 weeks/month ≈ $217/mo
    expect(proj!.scheduledMonthlyRate).toBeGreaterThan(21000);
    expect(proj!.scheduledMonthlyRate).toBeLessThan(22000);
  });

  it('paused scheduled transfers do not contribute', () => {
    const c = cat({ goal: { type: 'targetBalance', amount: 100000 } });
    const scheduled = [
      {
        id: 'sch1', accountId: 'a1', payeeId: null, categoryId: null,
        transferAccountId: null, amount: 50000, memo: '', flag: null,
        frequency: 'monthly' as const, startDate: '2026-04-01',
        nextDate: '2026-05-01', endDate: null, lastRunAt: null,
        paused: true, autoAssignCategoryId: 'c1',
        createdAt: 0, updatedAt: 0,
      },
    ];
    const proj = computeGoalProjection(c, 0, [], scheduled, '2026-04');
    expect(proj!.scheduledMonthlyRate).toBe(0);
  });
});
