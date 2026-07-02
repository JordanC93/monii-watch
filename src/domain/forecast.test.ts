import { describe, expect, it } from 'vitest';
import { computeForecast } from './forecast';
import { todayIso } from './date';
import type { Account, ScheduledTransaction } from './types';

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};

function sched(over: Partial<ScheduledTransaction> = {}): ScheduledTransaction {
  return {
    id: 's1', accountId: 'a1', payeeId: null, categoryId: null, transferAccountId: null,
    amount: -5000, memo: '', flag: null, frequency: 'monthly',
    startDate: '2026-04-10', nextDate: '2026-04-10', endDate: null,
    lastRunAt: null, paused: false, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('computeForecast', () => {
  it('returns horizonDays + 1 points starting at today', () => {
    const out = computeForecast([checking], [], [], 0, { today: '2026-04-01', horizonDays: 30 });
    expect(out.length).toBe(31);
    expect(out[0].date).toBe('2026-04-01');
    expect(out[30].date).toBe('2026-05-01');
  });

  it('defaults today to the local calendar date', () => {
    const out = computeForecast([checking], [], [], 0, { horizonDays: 1 });
    expect(out[0].date).toBe(todayIso());
  });

  it('applies scheduled amounts on their landing day', () => {
    const out = computeForecast([checking], [], [sched()], 0, { today: '2026-04-01', horizonDays: 30 });
    const before = out.find((p) => p.date === '2026-04-09')!;
    const on = out.find((p) => p.date === '2026-04-10')!;
    expect(on.hasScheduled).toBe(true);
    expect(on.projected - before.projected).toBe(-5000);
  });

  it('does not project scheduled occurrences past endDate', () => {
    const s = sched({ endDate: '2026-04-30' });
    const out = computeForecast([checking], [], [s], 0, { today: '2026-04-01', horizonDays: 90 });
    const apr = out.find((p) => p.date === '2026-04-10')!;
    const may = out.find((p) => p.date === '2026-05-10')!;
    expect(apr.hasScheduled).toBe(true);
    expect(may.hasScheduled).toBe(false);
    expect(may.projected).toBe(apr.projected);
  });

  it('skips paused templates', () => {
    const out = computeForecast([checking], [], [sched({ paused: true })], 0, { today: '2026-04-01', horizonDays: 30 });
    expect(out.every((p) => !p.hasScheduled)).toBe(true);
  });
});
