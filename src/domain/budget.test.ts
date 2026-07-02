import { describe, expect, it } from 'vitest';
import {
  computeAccountBalances, computeNetWorth, computeMonthActivity,
  computeMonthBudget, computeReadyToAssign, computeMonthStats, computeAgeOfMoney,
} from './budget';
import type { Account, Category, MonthAssignment, Transaction } from './types';

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

const checking: Account = {
  id: 'a1', name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: 0,
};
const savings: Account = {
  id: 'a2', name: 'Savings', type: 'savings', closed: false, order: 1, createdAt: 0,
};
const investment: Account = {
  id: 'a3', name: 'Brokerage', type: 'investment', closed: false, order: 2, createdAt: 0,
};
const cat: Category = {
  id: 'c1', groupId: 'g1', name: 'Groceries', color: null, emoji: null, order: 0, hidden: false,
};
const catRent: Category = {
  id: 'c2', groupId: 'g1', name: 'Rent', color: null, emoji: null, order: 1, hidden: false,
};

describe('computeAccountBalances', () => {
  it('returns 0 for accounts with no transactions', () => {
    const out = computeAccountBalances([checking], []);
    expect(out[0].balance).toBe(0);
    expect(out[0].clearedBalance).toBe(0);
    expect(out[0].uncleared).toBe(0);
  });
  it('sums signed amounts', () => {
    const out = computeAccountBalances([checking], [
      txn({ amount: 10000 }),
      txn({ amount: -3500 }),
    ]);
    expect(out[0].balance).toBe(6500);
  });
  it('separates cleared from uncleared', () => {
    const out = computeAccountBalances([checking], [
      txn({ amount: 10000, cleared: 'cleared' }),
      txn({ amount: -3500, cleared: 'uncleared' }),
    ]);
    expect(out[0].balance).toBe(6500);
    expect(out[0].clearedBalance).toBe(10000);
    expect(out[0].uncleared).toBe(-3500);
  });
  it('adds investment positions to balance', () => {
    const inv: Account = {
      ...investment,
      positions: [
        { id: 'p1', ticker: 'VTI', shares: 10, costBasis: 100000, lastPrice: 12000, lastPriceAt: 0 },
      ],
    };
    const out = computeAccountBalances([inv], []);
    // 10 shares * $120 = $1200 = 120000 cents
    expect(out[0].balance).toBe(120000);
  });
  it('honors fxRate for non-budget currency', () => {
    const eur: Account = { ...checking, id: 'a4', currency: 'EUR', fxRate: 1.1 };
    const out = computeAccountBalances([eur], [
      { ...txn({ amount: 10000, accountId: 'a4' }) },
    ]);
    expect(out[0].balance).toBe(10000);
    expect(out[0].balanceInBudgetCurrency).toBe(11000);
  });
  it('prefers a month fx snapshot over the account fxRate, matching computeMonthActivity', () => {
    const eur: Account = { ...checking, id: 'a4', currency: 'EUR', fxRate: 1.1 };
    const snapshots = [{ month: '2026-04', from: 'EUR', to: 'USD', rate: 1.25 }];
    const txns = [txn({ amount: -10000, accountId: 'a4', categoryId: 'c1', date: '2026-04-15' })];

    // With snapshots: the month snapshot rate (1.25) wins over fxRate (1.1).
    const withSnaps = computeAccountBalances([eur], txns, 'USD', snapshots, '2026-04');
    expect(withSnaps[0].balance).toBe(-10000);
    expect(withSnaps[0].balanceInBudgetCurrency).toBe(-12500);
    // Consistent with the envelope math for the same month.
    const activity = computeMonthActivity([eur], [cat], txns, '2026-04', 'USD', snapshots);
    expect(activity.get('c1')).toBe(withSnaps[0].balanceInBudgetCurrency);

    // Same call without snapshots: falls back to the account fxRate.
    const noSnaps = computeAccountBalances([eur], txns, 'USD', [], '2026-04');
    expect(noSnaps[0].balanceInBudgetCurrency).toBe(-11000);

    // Legacy call shape (no budgetCurrency at all): unchanged behavior.
    const legacy = computeAccountBalances([eur], txns);
    expect(legacy[0].balanceInBudgetCurrency).toBe(-11000);
  });
});

describe('computeNetWorth', () => {
  it('separates onBudget from tracking', () => {
    const out = computeAccountBalances([checking, investment], [
      txn({ amount: 100000, accountId: 'a1' }),
      txn({ amount: 50000, accountId: 'a3' }),
    ]);
    const nw = computeNetWorth(out);
    expect(nw.onBudget).toBe(100000);
    expect(nw.tracking).toBe(50000);
    expect(nw.total).toBe(150000);
  });
  it('skips closed accounts', () => {
    const closed: Account = { ...checking, id: 'closedAcc', closed: true };
    const out = computeAccountBalances([closed], [
      txn({ amount: 10000, accountId: 'closedAcc' }),
    ]);
    const nw = computeNetWorth(out);
    expect(nw.total).toBe(0);
  });
});

describe('computeMonthActivity', () => {
  it('sums per-category in the given month', () => {
    const txns = [
      txn({ amount: -3000, categoryId: 'c1', date: '2026-04-15' }),
      txn({ amount: -2000, categoryId: 'c1', date: '2026-04-20' }),
      txn({ amount: -1000, categoryId: 'c2', date: '2026-04-15' }),
      txn({ amount: -5000, categoryId: 'c1', date: '2026-03-01' }), // different month
    ];
    const out = computeMonthActivity([checking], [cat, catRent], txns, '2026-04');
    expect(out.get('c1')).toBe(-5000);
    expect(out.get('c2')).toBe(-1000);
  });
  it('skips transfers', () => {
    const txns = [
      txn({ amount: -3000, categoryId: 'c1', date: '2026-04-15' }),
      txn({ amount: -2000, categoryId: 'c1', date: '2026-04-15', transferAccountId: 'a2' }),
    ];
    const out = computeMonthActivity([checking], [cat], txns, '2026-04');
    expect(out.get('c1')).toBe(-3000);
  });
  it('handles split transactions', () => {
    const txns = [
      txn({
        amount: -5000,
        categoryId: null,
        splits: [
          { id: 's1', categoryId: 'c1', amount: -3000, memo: '' },
          { id: 's2', categoryId: 'c2', amount: -2000, memo: '' },
        ],
        date: '2026-04-15',
      }),
    ];
    const out = computeMonthActivity([checking], [cat, catRent], txns, '2026-04');
    expect(out.get('c1')).toBe(-3000);
    expect(out.get('c2')).toBe(-2000);
  });
});

describe('computeMonthBudget — assignment + activity + carry', () => {
  it('available = assigned + activity for a single month with no history', () => {
    const assignments: MonthAssignment[] = [
      { id: '2026-04|c1', month: '2026-04', categoryId: 'c1', assigned: 10000 },
    ];
    const txns = [txn({ amount: -3000, categoryId: 'c1', date: '2026-04-15' })];
    const out = computeMonthBudget([checking], [cat], txns, assignments, '2026-04');
    const c1 = out.get('c1')!;
    expect(c1.assigned).toBe(10000);
    expect(c1.activity).toBe(-3000);
    expect(c1.available).toBe(7000);
  });
  it('rolls available forward to next month', () => {
    const assignments: MonthAssignment[] = [
      { id: '2026-03|c1', month: '2026-03', categoryId: 'c1', assigned: 10000 },
      { id: '2026-04|c1', month: '2026-04', categoryId: 'c1', assigned: 5000 },
    ];
    const txns = [txn({ amount: -3000, categoryId: 'c1', date: '2026-03-15' })];
    const out = computeMonthBudget([checking], [cat], txns, assignments, '2026-04');
    const c1 = out.get('c1')!;
    // March: assigned 10000, spent 3000 → available 7000 carry into April
    // April: 7000 + 5000 = 12000 available
    expect(c1.available).toBe(12000);
  });
  it('walks every month between the earliest assignment and the target, across year boundaries', () => {
    const assignments: MonthAssignment[] = [
      { id: '2025-11|c1', month: '2025-11', categoryId: 'c1', assigned: 10000 },
    ];
    const txns = [txn({ amount: -4000, categoryId: 'c1', date: '2026-01-15' })];
    const out = computeMonthBudget([checking], [cat], txns, assignments, '2026-02');
    const c1 = out.get('c1')!;
    // Nov 10000 carries through Dec, Jan spends 4000, Feb shows 6000
    expect(c1.available).toBe(6000);
  });
  it('overspending rolls forward as negative available', () => {
    const assignments: MonthAssignment[] = [
      { id: '2026-03|c1', month: '2026-03', categoryId: 'c1', assigned: 5000 },
    ];
    const txns = [txn({ amount: -8000, categoryId: 'c1', date: '2026-03-15' })];
    const out = computeMonthBudget([checking], [cat], txns, assignments, '2026-04');
    const c1 = out.get('c1')!;
    expect(c1.available).toBe(-3000);
  });
});

describe('computeReadyToAssign', () => {
  it('inflows minus assignments', () => {
    const txns = [
      txn({ amount: 100000, categoryId: null, date: '2026-04-01' }), // inflow → RTA
    ];
    const assignments: MonthAssignment[] = [
      { id: '2026-04|c1', month: '2026-04', categoryId: 'c1', assigned: 30000 },
    ];
    const rta = computeReadyToAssign([checking], txns, assignments, '2026-04');
    expect(rta).toBe(70000);
  });
  it('split inflows whose categoryId is null go to RTA', () => {
    const txns = [
      txn({
        amount: 100000,
        categoryId: null,
        splits: [
          { id: 's1', categoryId: null, amount: 60000, memo: '' },
          { id: 's2', categoryId: null, amount: 40000, memo: '' },
        ],
        date: '2026-04-01',
      }),
    ];
    const rta = computeReadyToAssign([checking], txns, [], '2026-04');
    expect(rta).toBe(100000);
  });
  it('ignores transfers', () => {
    const txns = [
      txn({ amount: 100000, categoryId: null, transferAccountId: 'a2', date: '2026-04-01' }),
    ];
    const rta = computeReadyToAssign([checking], txns, [], '2026-04');
    expect(rta).toBe(0);
  });
  it('only counts on-budget accounts', () => {
    const txns = [
      txn({ amount: 100000, categoryId: null, accountId: 'a3', date: '2026-04-01' }), // investment
    ];
    const rta = computeReadyToAssign([checking, investment], txns, [], '2026-04');
    expect(rta).toBe(0);
  });
});

describe('computeMonthStats', () => {
  it('counts income vs spent', () => {
    const txns = [
      txn({ amount: 50000, date: '2026-04-01' }),
      txn({ amount: -3000, date: '2026-04-15' }),
      txn({ amount: -2000, date: '2026-04-20' }),
    ];
    const stats = computeMonthStats([checking], txns, '2026-04');
    expect(stats.income).toBe(50000);
    expect(stats.spent).toBe(5000);
    expect(stats.net).toBe(45000);
  });
});

describe('computeAgeOfMoney', () => {
  it('returns null when there are no outflows', () => {
    expect(computeAgeOfMoney([checking], [])).toBe(null);
  });
  it('computes the average age (FIFO)', () => {
    // Inflow Apr 1, outflow Apr 8 → age 7 days
    const result = computeAgeOfMoney(
      [checking],
      [
        txn({ amount: 10000, date: '2026-04-01' }),
        txn({ amount: -10000, date: '2026-04-08' }),
      ],
      new Date('2026-04-09'),
    );
    expect(result).toBe(7);
  });
  it('excludes outflows older than the window using a local-date cutoff', () => {
    const result = computeAgeOfMoney(
      [checking],
      [
        txn({ amount: 10000, date: '2026-01-01' }),
        txn({ amount: -10000, date: '2026-01-05' }), // age 4, outside window
        txn({ amount: 10000, date: '2026-04-01' }),
        txn({ amount: -10000, date: '2026-04-08' }), // age 7, inside window
      ],
      new Date(2026, 3, 9), // local Apr 9
      30,
    );
    expect(result).toBe(7);
  });
});
