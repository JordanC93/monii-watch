/**
 * Year-over-year category comparison (Tier 6 #5).
 *
 * For each category, compare YTD spending this year vs the same range
 * last year. Useful for catching "we're spending 30% more on dining
 * than this time last year".
 */

import type { Account, Category, Money, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type YoYRow = {
  categoryId: string;
  categoryName: string;
  thisYear: Money;
  lastYear: Money;
  /** Signed cents difference; positive = spending more this year. */
  diff: Money;
  /** Decimal pct change vs last year. 0.13 = +13%. NaN/Infinity guarded → 0. */
  pctChange: number;
};

export function computeYoY(
  accounts: Account[],
  categories: Category[],
  txns: Transaction[],
  todayIso: string,
): YoYRow[] {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );
  const today = new Date(todayIso + 'T00:00:00');
  const year = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-indexed
  const todayDay = today.getDate();

  // This year YTD: from Jan 1 (this year) to today
  // Last year, same range: Jan 1 (last year) to (today, but a year earlier)
  const ytdStart = `${year}-01-01`;
  const ytdEnd = todayIso;
  const lastStart = `${year - 1}-01-01`;
  const lastEnd = makeIso(year - 1, todayMonth, todayDay);

  const thisByCat = new Map<string, number>();
  const lastByCat = new Map<string, number>();

  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.oneTime) continue;
    const inThis = t.date >= ytdStart && t.date <= ytdEnd;
    const inLast = t.date >= lastStart && t.date <= lastEnd;
    if (!inThis && !inLast) continue;
    for (const part of categoriesTouched(t)) {
      if (!part.categoryId) continue;
      if (part.amount >= 0) continue;
      const spent = -part.amount;
      if (inThis) thisByCat.set(part.categoryId, (thisByCat.get(part.categoryId) ?? 0) + spent);
      if (inLast) lastByCat.set(part.categoryId, (lastByCat.get(part.categoryId) ?? 0) + spent);
    }
  }

  const out: YoYRow[] = [];
  for (const c of categories) {
    const ty = thisByCat.get(c.id) ?? 0;
    const ly = lastByCat.get(c.id) ?? 0;
    if (ty === 0 && ly === 0) continue;
    const pct = ly > 0 ? (ty - ly) / ly : (ty > 0 ? 1 : 0);
    out.push({
      categoryId: c.id,
      categoryName: c.name,
      thisYear: ty,
      lastYear: ly,
      diff: ty - ly,
      pctChange: pct,
    });
  }
  // Sort by absolute pct change descending — biggest movers first.
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

function makeIso(year: number, monthIdx: number, day: number): string {
  // Clamp day to month length for Feb 29 etc.
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
