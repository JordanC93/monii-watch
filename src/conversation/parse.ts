/**
 * Shared parsing primitives for intents — money amounts, account/category
 * lookup by fuzzy name, and date phrases ("today", "yesterday", "last
 * monday"). Pure functions; no Yjs, no React.
 */

import { dollarsToCents } from '../domain/money';
import type { Account, Category, Money } from '../domain/types';
import { todayIso } from '../domain/date';
import { addDays, format, parseISO } from 'date-fns';

/**
 * Pull the first dollar amount out of free text. Accepts:
 *   "$12.50"  "12.50"  "$1,234"  "12 dollars"  "12 bucks"
 *   "$80k"  "80k"  "1.5M"  (k/m suffix multipliers, case-insensitive)
 * Returns positive integer cents or null. Sign is the caller's problem —
 * "spent $12" is up to the addExpense intent to flip negative.
 */
export function extractAmount(text: string): Money | null {
  const t = text.replace(/,/g, '');
  const m = t.match(/(?:\$\s?|^|\s)(\d+(?:\.\d+)?)\s*([km])?\b(?:\s*(?:dollars?|bucks?|usd))?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'k') n *= 1000;
  else if (suffix === 'm') n *= 1_000_000;
  return dollarsToCents(n);
}

/**
 * Normalize a name for fuzzy matching: lowercase, strip non-alphanumerics,
 * collapse whitespace.
 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find the best matching account given a free-text fragment. Strategies, in
 * order: exact-equal → starts-with → contains → token overlap. Returns null
 * if no candidate has any overlap.
 */
export function findAccountByText(text: string, accounts: Account[]): Account | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;
  const onOpen = accounts.filter((a) => !a.closed);
  const exact = onOpen.find((a) => norm(a.name) === q);
  if (exact) return exact;
  const startsWith = onOpen.find((a) => norm(a.name).startsWith(q));
  if (startsWith) return startsWith;
  const contains = onOpen.find((a) => norm(a.name).includes(q) || q.includes(norm(a.name)));
  if (contains) return contains;
  return null;
}

/** Same shape as findAccountByText but for categories. */
export function findCategoryByText(text: string, categories: Category[]): Category | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;
  const visible = categories.filter((c) => !c.hidden);
  const exact = visible.find((c) => norm(c.name) === q);
  if (exact) return exact;
  const startsWith = visible.find((c) => norm(c.name).startsWith(q));
  if (startsWith) return startsWith;
  const contains = visible.find((c) => norm(c.name).includes(q) || q.includes(norm(c.name)));
  if (contains) return contains;
  return null;
}

/**
 * Parse a casual date phrase. Returns ISO yyyy-mm-dd or null.
 *   "today" "now" "yesterday"  "tuesday"  "2026-04-22"
 * Anything more elaborate is left to the caller (or refused).
 */
export function parseRelativeDate(phrase: string, today: string = todayIso()): string | null {
  const p = phrase.trim().toLowerCase();
  if (!p) return null;
  if (p === 'today' || p === 'now') return today;
  if (p === 'yesterday') return format(addDays(parseISO(today), -1), 'yyyy-MM-dd');
  if (p === 'tomorrow') return format(addDays(parseISO(today), 1), 'yyyy-MM-dd');
  // ISO date passes through if it parses
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    try { parseISO(p); return p; } catch { return null; }
  }
  // Day-of-week → most recent past occurrence
  const dows = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const idx = dows.indexOf(p);
  if (idx >= 0) {
    const d = parseISO(today);
    let diff = d.getDay() - idx;
    if (diff <= 0) diff += 7;
    return format(addDays(d, -diff), 'yyyy-MM-dd');
  }
  return null;
}
