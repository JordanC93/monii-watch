/**
 * Predictive payee suggestions (Tier 12 #6). Given a partial payee
 * string + transaction history, return ranked suggestions weighted by:
 *
 *   1. Substring match (existing behavior — needed for muscle memory).
 *   2. Frequency: payees that show up often outrank rare ones.
 *   3. Day-of-month proximity: a $15 charge on the 7th is more likely
 *      "Netflix" if Netflix has historically charged on the 5th-9th.
 *   4. Day-of-week: weekly purchases (groceries on Sundays, e.g.).
 *   5. Amount cluster: if the user typed an amount, payees who cluster
 *      around that amount get a boost.
 *
 * No NLP, no model — just statistics over the user's own data.
 *
 * Pure function: takes the data, returns the ranking. The caller
 * (autocomplete UI) handles wiring.
 */

import type { Money, Payee, Transaction } from './types';

export type PayeeSuggestionInput = {
  /** Partial text the user has typed. Empty = no substring filter. */
  query: string;
  /** Full payee list. */
  payees: Payee[];
  /** Recent transactions for context. */
  txns: Transaction[];
  /** Optional — the date the user is entering (defaults to today). */
  forDate?: string;
  /** Optional — the amount the user typed in cents (signed). */
  forAmount?: Money;
  /** Maximum suggestions to return. Default 5. */
  limit?: number;
  /** Optional — only consider transactions in this account. */
  accountId?: string;
};

export type PayeeSuggestion = {
  payee: Payee;
  /** Composite score (higher = better). For debugging / UI. */
  score: number;
  /** "$15 every 30 days" / "Mondays" / "around the 5th". Optional hint
   *  the autocomplete UI can render in muted text after the name. */
  hint?: string;
};

const RECENT_WINDOW_DAYS = 365;

export function suggestPayees(input: PayeeSuggestionInput): PayeeSuggestion[] {
  const limit = input.limit ?? 5;
  const today = input.forDate ? new Date(input.forDate + 'T00:00:00') : new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - RECENT_WINDOW_DAYS);

  // Aggregate per-payee stats from recent history.
  type Stat = {
    count: number;
    daysOfMonth: number[];
    daysOfWeek: number[];
    amounts: number[];
    lastSeen: number;
  };
  const stats = new Map<string, Stat>();
  for (const t of input.txns) {
    if (!t.payeeId) continue;
    if (input.accountId && t.accountId !== input.accountId) continue;
    if (t.transferAccountId) continue; // transfers aren't payee-driven
    const d = new Date(t.date + 'T00:00:00');
    if (d < cutoff) continue;
    const s = stats.get(t.payeeId) ?? {
      count: 0, daysOfMonth: [], daysOfWeek: [], amounts: [], lastSeen: 0,
    };
    s.count += 1;
    s.daysOfMonth.push(d.getDate());
    s.daysOfWeek.push(d.getDay());
    s.amounts.push(Math.abs(t.amount));
    s.lastSeen = Math.max(s.lastSeen, d.getTime());
    stats.set(t.payeeId, s);
  }

  const queryNorm = input.query.trim().toLowerCase();
  const todayDom = today.getDate();
  const todayDow = today.getDay();
  const targetAmount = input.forAmount !== undefined ? Math.abs(input.forAmount) : null;

  const ranked: PayeeSuggestion[] = [];
  for (const p of input.payees) {
    if (p.builtIn) continue;
    const nameNorm = p.name.toLowerCase();
    if (queryNorm && !nameNorm.includes(queryNorm)) continue;

    const s = stats.get(p.id);
    let score = 0;

    // Substring boost: prefer prefix matches over middle.
    if (queryNorm) {
      score += nameNorm.startsWith(queryNorm) ? 4 : 1;
    }
    if (!s) {
      // Payees with no recent history get a low base score so they
      // appear but rank below known payees.
      ranked.push({ payee: p, score });
      continue;
    }

    // Frequency: log-scale so "10 occurrences" doesn't crush "3".
    score += Math.log2(s.count + 1) * 2;

    // Recency: more recent = more relevant. Within the last 30 days
    // gets the full bonus; older fades to zero across 6 months.
    const daysSinceLast = (today.getTime() - s.lastSeen) / 86400000;
    score += Math.max(0, 3 - daysSinceLast / 60);

    // Day-of-month proximity: closer to today's DoM = higher score.
    // Most subscriptions are billed on the same day of the month.
    const avgDom = avg(s.daysOfMonth);
    const domDelta = Math.min(
      Math.abs(avgDom - todayDom),
      31 - Math.abs(avgDom - todayDom), // wrap (1st vs 30th = 1 day apart, not 29)
    );
    if (domDelta <= 3) score += (3 - domDelta) * 0.8;

    // Day-of-week match: weekly habits (groceries on Sundays).
    const dowFreq = new Map<number, number>();
    for (const d of s.daysOfWeek) dowFreq.set(d, (dowFreq.get(d) ?? 0) + 1);
    const topDow = [...dowFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topDow && topDow[0] === todayDow && topDow[1] >= 3) {
      score += 1.5;
    }

    // Amount match: if the user typed an amount, payees who hover
    // around that get a boost.
    if (targetAmount !== null && s.amounts.length > 0) {
      const avgAmount = avg(s.amounts);
      const ratio = avgAmount === 0 ? Infinity : Math.abs(avgAmount - targetAmount) / avgAmount;
      if (ratio < 0.05) score += 3;        // within 5%
      else if (ratio < 0.15) score += 1.5; // within 15%
    }

    // Generate a friendly hint string the UI can render
    let hint: string | undefined;
    const monthlyCadence = guessMonthlyCadence(s);
    if (monthlyCadence && targetAmount === null) {
      hint = monthlyCadence;
    }

    ranked.push({ payee: p, score, hint });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * Detect a monthly cadence — payees that fire 3+ times in the recent
 * window with a similar day-of-month each time.
 */
function guessMonthlyCadence(s: { count: number; daysOfMonth: number[]; daysOfWeek: number[] }): string | undefined {
  if (s.count < 3) return undefined;
  const avgDom = Math.round(avg(s.daysOfMonth));
  // Variance check: if all DoMs are within ±3 of avg, call it monthly.
  const spread = Math.max(...s.daysOfMonth) - Math.min(...s.daysOfMonth);
  if (spread > 6) return undefined;
  const suffix = ordinalSuffix(avgDom);
  return `~${avgDom}${suffix} of each month`;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
