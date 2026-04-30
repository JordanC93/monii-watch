/**
 * Price extraction from pasted product page content (Tier 9 #2).
 *
 * Pure heuristic — no DOM parsing, just regex over the text the
 * user pasted. Covers the common store formats:
 *   - "$1,299.00" or "$1299.00"
 *   - "Sale price: $1,299"
 *   - "Was $1,499 — now $1,299"
 *
 * Returns the LOWEST plausible product price after filtering out
 * tiny promotional amounts ("Save $200" callouts).
 */

import type { Money } from './types';

export type PriceParseResult = {
  /** Best-guess current price in cents. */
  cents: Money;
  /** Original sticker price if visible (regular > sale). */
  originalCents?: Money;
  /** Confidence 0..1 — higher when the parser is sure. */
  confidence: number;
};

// Match any $-prefixed numeric token. Allows digits, optional thousands
// separators, optional decimal. Trailing `(?!\d)` prevents matching
// only a prefix of a larger number like "$1299" (would otherwise greedy-
// match "$129" and leave "9" behind).
const PRICE_RE = /\$\s?([0-9][0-9,_]*(?:\.[0-9]{1,2})?)(?!\d)/g;

function extractAllPrices(text: string): number[] {
  const out: number[] = [];
  PRICE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_RE.exec(text))) {
    const raw = m[1].replace(/[,_]/g, '');
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    if (v < 1 || v > 1_000_000) continue;
    out.push(v);
  }
  return out;
}

/** Extract the lowest plausible price (cents) from text. */
export function parsePriceFromText(text: string): PriceParseResult | null {
  if (!text) return null;
  const all = extractAllPrices(text);
  if (all.length === 0) return null;
  // Heuristic: drop "Save $X" / promo callouts. If the highest price
  // dwarfs the smallest by 4×+, the smallest is probably a discount
  // amount, not the product price. Keep only values within an order
  // of magnitude of the max.
  const max = Math.max(...all);
  const meaningful = all.filter((v) => v >= max * 0.25 || all.length < 3);
  const pool = meaningful.length > 0 ? meaningful : all;
  const sorted = [...pool].sort((a, b) => a - b);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const cents = Math.round(lowest * 100);
  const originalCents = highest > lowest ? Math.round(highest * 100) : undefined;
  const confidence = Math.min(1, pool.length / 5);
  return { cents, originalCents, confidence };
}

/**
 * Extract a single explicit price from a short user phrase like
 * "set laptop price to $1299" or "$1,299 for the laptop". Returns the
 * cents found, or null. Less aggressive than the full pasted-content
 * parser — only matches one explicit dollar amount.
 */
export function parseSinglePrice(input: string): Money | null {
  const m = input.match(/\$\s?([0-9][0-9,_]*(?:\.[0-9]{1,2})?)(?!\d)/);
  if (!m) return null;
  const raw = m[1].replace(/[,_]/g, '');
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}
