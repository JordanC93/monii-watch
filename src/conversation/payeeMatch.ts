/**
 * Fuzzy payee matcher for receipt uploads (v0.7.21).
 *
 * The receipt OCR pipeline lifts a vendor name straight out of the
 * scan ("Starbucks Coffee Com..." with the trailing word truncated by
 * the receipt's display, "PAYPAL *UBER 7724", etc). Saving as-is
 * creates a brand-new payee for every variation, fragmenting the
 * user's payee list and breaking the auto-categorize history.
 *
 * This module compares the parsed vendor against the user's existing
 * payee list and returns the best match WHEN the similarity is high
 * enough to be worth surfacing in the UI ("Did you mean Starbucks?
 * Yes / No"). Anything below the threshold returns null and the
 * receipt flow keeps the parsed name as a new payee.
 *
 * Pure function — no DOM, no Yjs. Lives in conversation/ next to
 * cardMatch.ts which does the analogous job for the account.
 */

import type { Payee } from '../domain/types';

/** A match result above the confidence threshold. */
export type PayeeMatchResult = {
  payee: Payee;
  /** 0..1. Anything returned by the helper is already ≥ threshold. */
  score: number;
};

/** The confidence floor below which we stay quiet (no prompt). 0.70
 *  matches the maintainer's stated 70% bar for the "ask the user"
 *  surface — a single shared token like "starbucks" between the
 *  parsed name and the existing payee passes; unrelated names like
 *  "Walmart" vs "Starbucks" do not. */
export const MATCH_THRESHOLD = 0.70;

/**
 * Top-level helper: best fuzzy match for the parsed vendor against
 * the user's payee list, IF the score clears MATCH_THRESHOLD. The
 * caller (ReceiptUploadModal) treats this as "show the prompt"
 * whenever a result is returned.
 *
 * Skips the exact-match case — `ensurePayee` already handles that
 * silently inside repo.ts. Returning a match here would be a
 * pointless prompt. We only return when the match is close-but-
 * not-identical, which is the case worth confirming.
 */
export function findFuzzyPayeeMatch(
  parsedVendor: string,
  payees: Payee[],
): PayeeMatchResult | null {
  const parsed = normalizeVendorName(parsedVendor);
  if (!parsed || payees.length === 0) return null;

  let best: PayeeMatchResult | null = null;
  for (const p of payees) {
    const existing = normalizeVendorName(p.name);
    if (!existing) continue;
    // Skip exact matches — repo.ensurePayee handles those without
    // any prompt needed.
    if (existing === parsed) return null;
    const score = vendorMatchScore(parsed, existing);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score) best = { payee: p, score };
  }
  return best;
}

/**
 * Score the similarity of two NORMALIZED vendor strings. Returns 0..1.
 *
 * Strategy (highest signal first):
 *
 *   1. Identical → 1.0 (caller short-circuits before this so this
 *      branch is for completeness)
 *   2. One is a token-aligned prefix of the other ("Starbucks" prefix
 *      of "Starbucks Coffee Com") → high score, scaled by how much
 *      of the longer string the prefix covers
 *   3. One contains the other as a substring → similar but lower
 *   4. Token overlap (Jaccard) with a first-token-match bonus
 *
 * The first-token bonus matters because receipt OCR usually preserves
 * the brand name at the start ("Starbucks Coffee #4321" / "Starbucks
 * Pike Place" / "STARBUCKS-9876") even when the rest of the line
 * varies. So the first word is the highest-signal token.
 */
export function vendorMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Token-aligned prefix: one starts with the other AND the next
  // character (if any) is a word boundary. Catches "Starbucks" vs
  // "Starbucks Coffee Com" but rejects "Star" vs "Starbucks" (which
  // would be a partial-word prefix and a coincidence risk).
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.startsWith(shorter) && (longer.length === shorter.length || longer[shorter.length] === ' ')) {
    // 0.85 floor so a partial-word match (e.g. "Costco" vs "Costco
    // Wholesale Inc") is always above the 0.70 threshold. Scale
    // upward slightly with the shorter/longer ratio so a shorter
    // string buried in a much longer one doesn't outscore a tighter
    // match.
    const ratio = shorter.length / longer.length;
    return Math.min(0.95, 0.80 + ratio * 0.15);
  }

  // Token overlap (Jaccard) + first-token bonus.
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection: string[] = [];
  for (const t of aSet) if (bSet.has(t)) intersection.push(t);
  if (intersection.length === 0) return 0;
  const union = new Set([...aSet, ...bSet]);
  const jaccard = intersection.length / union.size;

  // First-token match is the strongest signal in vendor names.
  // "Starbucks Coffee" vs "Starbucks Pike Place" both start with
  // "starbucks" — same merchant, different store note. Bonus is
  // sized so any first-word match clears MATCH_THRESHOLD (0.70)
  // even when there's only one token in common.
  const firstMatch = aTokens[0] && aTokens[0] === bTokens[0] ? 0.50 : 0;
  // Cap at 0.85 so token-overlap alone never beats the prefix path.
  return Math.min(0.85, jaccard + firstMatch);
}

/**
 * Normalize a vendor name for comparison. Lowercase, collapse
 * whitespace, strip punctuation and the bag of receipt-noise tokens
 * that PayPal / Square / payment processors append.
 *
 * Examples:
 *   "Starbucks Coffee Com..." → "starbucks coffee com"
 *   "PAYPAL *UBER 7724"       → "paypal uber"
 *   "STARBUCKS #04321"        → "starbucks"
 *   "Amazon.com*M12RT89"      → "amazon"
 *
 * Aggressive about stripping IDs / trailing alphanum codes because
 * those vary per transaction and would otherwise dominate the
 * Jaccard distance.
 */
export function normalizeVendorName(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase();
  // Replace common punctuation that splits words with spaces. Includes
  // `.` so "amazon.com" tokenizes as ["amazon", "com"], and ellipses
  // from truncated PayPal titles ("Coffee Com...") collapse to whitespace.
  s = s.replace(/[*#@&|/\\,;:.()\[\]{}]+/g, ' ');
  // Tokenize on whitespace, dashes, and dots that aren't decimals.
  // Keep dashes that look like part of a word ("E-Z Pass") by being
  // selective: only break on standalone dashes / hyphens runs.
  s = s.replace(/\s+-\s+|--+/g, ' ');
  // Drop tokens that are pure noise: long digit-only refs, mixed
  // alphanum codes, common payment-processor flags. Done by walking
  // tokens after a coarse whitespace split.
  const tokens = s.split(/\s+/).filter(Boolean).map(t => t.replace(/[.\-_]+$/, '').replace(/^[.\-_]+/, ''));
  const cleaned: string[] = [];
  for (const t of tokens) {
    if (!t) continue;
    // Drop pure digit runs of 4+ — transaction IDs, store numbers.
    if (/^\d{4,}$/.test(t)) continue;
    // Drop mixed alphanum tokens of 5+ that have any digit AND any
    // letter — typical for transaction refs like "M12RT89", "abc123".
    if (t.length >= 5 && /\d/.test(t) && /[a-z]/.test(t)) continue;
    // Drop single-character tokens unless they're meaningful letters.
    if (t.length === 1 && !/[a-z]/.test(t)) continue;
    // Drop generic processor / suffix words that don't carry brand
    // identity. Conservative list — only words that we're confident
    // never matter.
    if (NOISE_TOKENS.has(t)) continue;
    cleaned.push(t);
  }
  return cleaned.join(' ').trim();
}

const NOISE_TOKENS = new Set([
  'inc', 'incorporated',
  'llc', 'l.l.c.',
  'ltd', 'limited',
  'co', 'company',
  'corp', 'corporation',
  'usa', 'us',
  'the',
  'purchase', 'payment',
  'recurring', 'autopay',
]);
