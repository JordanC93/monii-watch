/**
 * Category drill-down analytics (Tier 7 #4).
 *
 * For ONE category, compute:
 *   - 12-month outflow breakdown (per-month spend) for variable bill
 *     visualization (e.g. electricity, water, gas)
 *   - This-year YTD vs last-year YTD
 *   - Min / max / median / average across the trailing 12 months
 *   - Top payees within the category, sorted by spend
 *   - The latest N transactions
 *   - Insight banners ("highest in July $412, lowest in April $85")
 */

import type { Account, Money, Payee, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type MonthlySpend = {
  month: string; // YYYY-MM
  cents: Money;
  count: number;
};

export type CategoryDetail = {
  /** 12 months of trailing spend, oldest first. */
  monthly: MonthlySpend[];
  /** Min / max / avg / median across the 12 months WITH activity. */
  stats: {
    avg: Money;
    min: Money;
    max: Money;
    median: Money;
    /** Index in `monthly` of the highest-spend month (or -1). */
    maxMonthIdx: number;
    /** Index in `monthly` of the lowest non-zero month (or -1). */
    minMonthIdx: number;
    activeMonths: number;
    rangeRatio: number; // max / max(1, min) — variability indicator
  };
  /** Year-to-date this year vs same range last year. */
  yoy: {
    thisYear: Money;
    lastYear: Money;
    diff: Money;
    pctChange: number;
  };
  /** Top payees inside this category. */
  topPayees: Array<{
    payeeId: string;
    payeeName: string;
    cents: Money;
    count: number;
  }>;
  /** Most recent transactions (last 30). */
  recent: Array<{
    id: string;
    accountId: string;
    date: string;
    payeeId: string | null;
    amount: Money;
    memo: string;
  }>;
  /** Year-over-year per-month breakdown for the SAME calendar months last year. */
  monthlyLastYear: MonthlySpend[];
};

export function computeCategoryDetail(
  categoryId: string,
  accounts: Account[],
  txns: Transaction[],
  payees: Payee[],
  todayIso: string,
): CategoryDetail {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const today = new Date(todayIso + 'T00:00:00');
  const thisYear = today.getFullYear();

  // Build the 12 months we want to display (oldest first).
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  // Same months a year ago for YoY chart
  const lastYearMonths = months.map((m) => {
    const [y, mm] = m.split('-').map(Number);
    return `${y - 1}-${String(mm).padStart(2, '0')}`;
  });

  const monthIdx = new Map<string, number>();
  months.forEach((m, i) => monthIdx.set(m, i));
  const lastYearIdx = new Map<string, number>();
  lastYearMonths.forEach((m, i) => lastYearIdx.set(m, i));

  const monthly: MonthlySpend[] = months.map((month) => ({ month, cents: 0, count: 0 }));
  const monthlyLY: MonthlySpend[] = lastYearMonths.map((month) => ({ month, cents: 0, count: 0 }));

  let ytdThis = 0;
  let ytdLast = 0;
  const ytdEnd = todayIso;
  const ytdStart = `${thisYear}-01-01`;
  const lastStart = `${thisYear - 1}-01-01`;
  const lastEnd = makeIsoSafe(thisYear - 1, today.getMonth() + 1, today.getDate());

  const payeeTotals = new Map<string, { cents: number; count: number }>();
  const recent: CategoryDetail['recent'] = [];

  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue;

    let categoryAmount = 0;
    for (const part of categoriesTouched(t)) {
      if (part.categoryId !== categoryId) continue;
      categoryAmount += part.amount;
    }
    if (categoryAmount === 0) continue;
    if (categoryAmount > 0) continue; // outflows only for the breakdown

    const month = t.date.slice(0, 7);
    const cents = -categoryAmount;

    const idx = monthIdx.get(month);
    if (idx !== undefined) {
      monthly[idx].cents += cents;
      monthly[idx].count += 1;
    }
    const lyIdx = lastYearIdx.get(month);
    if (lyIdx !== undefined) {
      monthlyLY[lyIdx].cents += cents;
      monthlyLY[lyIdx].count += 1;
    }
    if (t.date >= ytdStart && t.date <= ytdEnd) ytdThis += cents;
    if (t.date >= lastStart && t.date <= lastEnd) ytdLast += cents;

    if (t.payeeId) {
      const p = payeeTotals.get(t.payeeId) ?? { cents: 0, count: 0 };
      p.cents += cents;
      p.count += 1;
      payeeTotals.set(t.payeeId, p);
    }

    if (recent.length < 30) {
      recent.push({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        payeeId: t.payeeId,
        amount: -cents,
        memo: t.memo,
      });
    }
  }

  // Sort recent by date desc.
  recent.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Stats: min, max, median, avg over months that had activity.
  const active = monthly.filter((m) => m.cents > 0);
  const sorted = [...active].sort((a, b) => a.cents - b.cents);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)].cents : 0;
  const sum = active.reduce((s, m) => s + m.cents, 0);
  const avg = active.length > 0 ? Math.round(sum / active.length) : 0;
  const max = active.length > 0 ? sorted[sorted.length - 1].cents : 0;
  const min = active.length > 0 ? sorted[0].cents : 0;
  const maxMonthIdx = max > 0 ? monthly.findIndex((m) => m.cents === max) : -1;
  const minMonthIdx = min > 0 ? monthly.findIndex((m) => m.cents === min && m.cents > 0) : -1;
  const rangeRatio = min > 0 ? max / min : (max > 0 ? Infinity : 1);

  const topPayees = Array.from(payeeTotals.entries())
    .map(([payeeId, v]) => ({
      payeeId,
      payeeName: payees.find((p) => p.id === payeeId)?.name ?? 'Unknown',
      cents: v.cents,
      count: v.count,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  return {
    monthly,
    monthlyLastYear: monthlyLY,
    stats: { avg, min, max, median, maxMonthIdx, minMonthIdx, activeMonths: active.length, rangeRatio },
    yoy: {
      thisYear: ytdThis,
      lastYear: ytdLast,
      diff: ytdThis - ytdLast,
      pctChange: ytdLast > 0 ? (ytdThis - ytdLast) / ytdLast : (ytdThis > 0 ? 1 : 0),
    },
    topPayees,
    recent,
  };
}

function makeIsoSafe(year: number, monthOneIndexed: number, day: number): string {
  const lastDay = new Date(year, monthOneIndexed, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(monthOneIndexed).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function formatMonthShort(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${String(y).slice(2)}`;
}
