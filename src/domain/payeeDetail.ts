/**
 * Payee drill-down analytics.
 *
 * For ONE payee, compute:
 *   - 12-month outflow breakdown (per-month spend) so the user can see
 *     fluctuation — perfect for utility bills like Con Edison or
 *     recurring grocery shops at Trader Joes.
 *   - This-year YTD vs last-year YTD
 *   - Min / max / median / average across the trailing 12 months
 *   - Top categories used at this payee, sorted by spend (useful for
 *     places where you split a single trip across multiple categories,
 *     e.g. Trader Joes → Groceries + Household supplies)
 *   - Average per visit + visit count
 *   - The latest N transactions
 *
 * Mirrors `categoryDetail.ts`'s shape so the same chart component +
 * StatTile patterns can be reused with no friction.
 */

import type { Account, Category, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';
import type { MonthlySpend } from './categoryDetail';

export type PayeeDetail = {
  /** 12 months of trailing spend at this payee, oldest first. */
  monthly: MonthlySpend[];
  /** Same months a year earlier — for the YoY chart overlay. */
  monthlyLastYear: MonthlySpend[];
  /** Min / max / avg / median across months WITH activity. */
  stats: {
    avg: Money;
    min: Money;
    max: Money;
    median: Money;
    /** Index in `monthly` of the highest-spend month (or -1). */
    maxMonthIdx: number;
    /** Index in `monthly` of the lowest non-zero month (or -1). */
    minMonthIdx: number;
    /** Number of months in the trailing 12 that had any spend. */
    activeMonths: number;
    /** max / max(1, min) — used by the page to flag "highly variable"
     *  payees (e.g. utilities where the bill swings ±2-3× across the
     *  year for AC vs heat seasons). */
    rangeRatio: number;
    /** Average dollars-per-transaction across the visible window. */
    avgPerVisit: Money;
    /** Total transactions in the visible window. */
    totalVisits: number;
    /** Lifetime totals across ALL data, not just trailing 12 months. */
    lifetimeCents: Money;
    lifetimeCount: number;
    /** ISO yyyy-mm-dd of the very first / most-recent transaction. */
    firstSeen: string | null;
    lastSeen: string | null;
  };
  /** Year-to-date this year vs same range last year. */
  yoy: {
    thisYear: Money;
    lastYear: Money;
    diff: Money;
    pctChange: number;
  };
  /** Top categories used AT this payee — inverse of categoryDetail's
   *  `topPayees`. Helpful for split-able payees: Trader Joes might
   *  show Groceries 80% / Household 15% / Pet 5%. */
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    cents: Money;
    count: number;
  }>;
  /** Most recent transactions (last 30). */
  recent: Array<{
    id: string;
    accountId: string;
    date: string;
    categoryId: string | null;
    amount: Money;
    memo: string;
  }>;
};

export function computePayeeDetail(
  payeeId: string,
  accounts: Account[],
  txns: Transaction[],
  categories: Category[],
  todayIso: string,
): PayeeDetail {
  // On-budget filter mirrors categoryDetail — tracking accounts (e.g.
  // brokerage, loans) shouldn't show up in spend analytics.
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
  let lifetimeCents = 0;
  let lifetimeCount = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  const ytdEnd = todayIso;
  const ytdStart = `${thisYear}-01-01`;
  const lastStart = `${thisYear - 1}-01-01`;
  const lastEnd = makeIsoSafe(thisYear - 1, today.getMonth() + 1, today.getDate());

  // Spend-by-category aggregation. Splits are honored via
  // categoriesTouched(): one transaction with three split parts at the
  // same payee shows in all three category buckets.
  const catTotals = new Map<string | null, { cents: number; count: number }>();
  const recent: PayeeDetail['recent'] = [];
  let totalVisits = 0;

  for (const t of txns) {
    if (t.payeeId !== payeeId) continue;
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    // We deliberately INCLUDE oneTime transactions for payee analytics —
    // unlike categoryDetail which excludes them. The "I spent $200 at
    // Best Buy" one-off is exactly the kind of thing the user wants to
    // see in their Best Buy history, even if the category-level chart
    // intentionally excludes it.

    // Total spend (negative cents = outflow). For payees we want the
    // entire transaction amount, not category-filtered, since the user
    // is asking "how much did I spend at this payee".
    const txnAmount = t.amount;
    if (txnAmount === 0) continue;

    // Track lifetime stats regardless of date window
    lifetimeCount += 1;
    if (txnAmount < 0) lifetimeCents += -txnAmount;
    if (firstSeen === null || t.date < firstSeen) firstSeen = t.date;
    if (lastSeen === null || t.date > lastSeen) lastSeen = t.date;

    // Only outflows (negative amounts) count for the spend chart and
    // monthly stats. A refund / inflow at a payee shouldn't pad the
    // "monthly spend" bar.
    if (txnAmount > 0) continue;

    const month = t.date.slice(0, 7);
    const cents = -txnAmount;

    const idx = monthIdx.get(month);
    if (idx !== undefined) {
      monthly[idx].cents += cents;
      monthly[idx].count += 1;
      totalVisits += 1;
    }
    const lyIdx = lastYearIdx.get(month);
    if (lyIdx !== undefined) {
      monthlyLY[lyIdx].cents += cents;
      monthlyLY[lyIdx].count += 1;
    }
    if (t.date >= ytdStart && t.date <= ytdEnd) ytdThis += cents;
    if (t.date >= lastStart && t.date <= lastEnd) ytdLast += cents;

    // Spend-by-category — uses the same categoriesTouched() helper that
    // the category page uses, so split transactions are correctly
    // distributed across multiple categories.
    for (const part of categoriesTouched(t)) {
      const partOutflow = part.amount < 0 ? -part.amount : 0;
      if (partOutflow === 0) continue;
      const key = part.categoryId;
      const c = catTotals.get(key) ?? { cents: 0, count: 0 };
      c.cents += partOutflow;
      // Count the WHOLE transaction once per (category) — splits across
      // 3 categories should show count=1 for each, not 3 each.
      c.count += 1;
      catTotals.set(key, c);
    }

    if (recent.length < 30) {
      recent.push({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        categoryId: t.categoryId ?? null,
        amount: t.amount,
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
  const avgPerVisit = totalVisits > 0 ? Math.round(sum / totalVisits) : 0;

  const topCategories = Array.from(catTotals.entries())
    .filter(([categoryId]) => categoryId !== null)
    .map(([categoryId, v]) => ({
      categoryId: categoryId as string,
      categoryName: categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized',
      cents: v.cents,
      count: v.count,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  return {
    monthly,
    monthlyLastYear: monthlyLY,
    stats: {
      avg, min, max, median, maxMonthIdx, minMonthIdx,
      activeMonths: active.length,
      rangeRatio,
      avgPerVisit, totalVisits,
      lifetimeCents, lifetimeCount,
      firstSeen, lastSeen,
    },
    yoy: {
      thisYear: ytdThis,
      lastYear: ytdLast,
      diff: ytdThis - ytdLast,
      pctChange: ytdLast > 0 ? (ytdThis - ytdLast) / ytdLast : (ytdThis > 0 ? 1 : 0),
    },
    topCategories,
    recent,
  };
}

function makeIsoSafe(year: number, monthOneIndexed: number, day: number): string {
  const lastDay = new Date(year, monthOneIndexed, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(monthOneIndexed).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}
