/**
 * Year-in-review aggregations. Spotify-Wrapped-style annual summary
 * computed entirely from existing `transactions[]` — no schema needed.
 *
 * Returns a small bag of slides the modal renders one after the other.
 * Each slide has a `kind` discriminator + a tiny payload — keep them
 * shape-stable so adding new slides is a pure addition, never a
 * breaking change.
 */

import type { Account, Category, Payee, Transaction } from './types';
import { ACCOUNT_TYPE_META, categoriesTouched } from './types';

export type YearReviewSlide =
  | { kind: 'intro'; year: number; totalTxns: number; totalSpent: number; totalEarned: number }
  | { kind: 'topVendors'; vendors: Array<{ name: string; spent: number; count: number }> }
  | { kind: 'topCategories'; categories: Array<{ name: string; spent: number }> }
  | { kind: 'biggestSingleSpend'; payee: string; categoryName: string; amount: number; date: string }
  | { kind: 'busiestDay'; weekday: string; avgSpent: number; txnCount: number }
  | { kind: 'savingsRate'; income: number; spent: number; net: number; ratePct: number }
  | { kind: 'monthlyHigh'; month: string; spent: number }
  | { kind: 'streakAndCount'; reconciledCount: number; goalsHit: number };

export function computeYearReview(
  year: number,
  txns: Transaction[],
  accounts: Account[],
  categories: Category[],
  payees: Payee[],
): YearReviewSlide[] {
  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget).map((a) => a.id),
  );
  const yearTxns = txns.filter((t) =>
    t.date.startsWith(String(year)) && !t.transferAccountId && onBudgetIds.has(t.accountId),
  );

  if (yearTxns.length === 0) return [];

  // Totals.
  let totalSpent = 0;
  let totalEarned = 0;
  for (const t of yearTxns) {
    for (const part of categoriesTouched(t)) {
      if (part.amount > 0) totalEarned += part.amount;
      else totalSpent += -part.amount;
    }
  }

  // Top vendors.
  const vendorAgg = new Map<string, { spent: number; count: number }>();
  for (const t of yearTxns) {
    if (!t.payeeId) continue;
    if (t.amount >= 0) continue;
    const cur = vendorAgg.get(t.payeeId) ?? { spent: 0, count: 0 };
    cur.spent += -t.amount;
    cur.count += 1;
    vendorAgg.set(t.payeeId, cur);
  }
  const topVendors = [...vendorAgg.entries()]
    .map(([pid, v]) => ({ name: payees.find((p) => p.id === pid)?.name ?? '?', ...v }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  // Top categories.
  const catAgg = new Map<string, number>();
  for (const t of yearTxns) {
    for (const part of categoriesTouched(t)) {
      if (!part.categoryId) continue;
      if (part.amount >= 0) continue;
      catAgg.set(part.categoryId, (catAgg.get(part.categoryId) ?? 0) + -part.amount);
    }
  }
  const topCategories = [...catAgg.entries()]
    .map(([cid, spent]) => ({ name: categories.find((c) => c.id === cid)?.name ?? '?', spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  // Biggest single spend.
  let biggest: Transaction | null = null;
  for (const t of yearTxns) {
    if (t.amount >= 0) continue;
    if (!biggest || t.amount < biggest.amount) biggest = t;
  }

  // Busiest weekday.
  const dayAgg: Array<{ count: number; spent: number }> = Array.from({ length: 7 }, () => ({ count: 0, spent: 0 }));
  for (const t of yearTxns) {
    if (t.amount >= 0) continue;
    const d = new Date(t.date + 'T00:00:00');
    dayAgg[d.getDay()].spent += -t.amount;
    dayAgg[d.getDay()].count += 1;
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let busyIx = 0;
  for (let i = 1; i < 7; i++) if (dayAgg[i].spent > dayAgg[busyIx].spent) busyIx = i;
  const avgPerBusyDay = dayAgg[busyIx].count > 0 ? Math.round(dayAgg[busyIx].spent / dayAgg[busyIx].count) : 0;

  // Highest-spend month.
  const monthAgg = new Map<string, number>();
  for (const t of yearTxns) {
    if (t.amount >= 0) continue;
    const m = t.date.slice(0, 7);
    monthAgg.set(m, (monthAgg.get(m) ?? 0) + -t.amount);
  }
  const sortedMonths = [...monthAgg.entries()].sort((a, b) => b[1] - a[1]);

  // Reconciliation streak: count of reconciled txns is a proxy for "you stayed on top of it".
  const reconciledCount = yearTxns.filter((t) => t.cleared === 'reconciled').length;

  // Goals hit: any category with a goal whose amount was reached at year-end.
  // Approximation — uses txns-derived activity, not month assignment ledger.
  const goalsHit = categories.filter((c) => {
    if (!c.goal || c.goal.amount <= 0) return false;
    const cumulative = (catAgg.get(c.id) ?? 0); // spent only — used as a proxy
    void cumulative;
    return false; // exact computation needs month-budget walk; defer for v1
  }).length;

  const ratePct = totalEarned > 0 ? Math.round(((totalEarned - totalSpent) / totalEarned) * 100) : 0;

  const slides: YearReviewSlide[] = [
    { kind: 'intro', year, totalTxns: yearTxns.length, totalSpent, totalEarned },
    { kind: 'topVendors', vendors: topVendors },
    { kind: 'topCategories', categories: topCategories },
  ];
  if (biggest) {
    const cat = biggest.categoryId ? categories.find((c) => c.id === biggest!.categoryId) : null;
    const p = biggest.payeeId ? payees.find((x) => x.id === biggest!.payeeId) : null;
    slides.push({
      kind: 'biggestSingleSpend',
      payee: p?.name ?? '?',
      categoryName: cat?.name ?? 'Uncategorized',
      amount: -biggest.amount,
      date: biggest.date,
    });
  }
  slides.push({ kind: 'busiestDay', weekday: dayNames[busyIx], avgSpent: avgPerBusyDay, txnCount: dayAgg[busyIx].count });
  slides.push({ kind: 'savingsRate', income: totalEarned, spent: totalSpent, net: totalEarned - totalSpent, ratePct });
  if (sortedMonths.length > 0) {
    slides.push({ kind: 'monthlyHigh', month: sortedMonths[0][0], spent: sortedMonths[0][1] });
  }
  slides.push({ kind: 'streakAndCount', reconciledCount, goalsHit });

  return slides;
}
