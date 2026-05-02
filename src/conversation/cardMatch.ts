/**
 * Card-on-receipt detector (Tier 12 #16).
 *
 * Given OCR'd receipt text + the user's accounts, find which (if
 * any) account the charge was made on. Used by the receipt upload
 * flow to auto-route a scanned charge to the right account.
 *
 * Pure function — no DOM, no Yjs, no storage. Lives in `conversation/`
 * alongside the rest of the receipt parsing pipeline.
 *
 * The matcher returns a confidence level the caller uses to decide
 * whether to silently auto-assign (HIGH), assign with a toast notice
 * (MEDIUM), surface a confirmation modal (LOW), or skip (NONE).
 */

import type { Account } from '../domain/types';

export type CardMatchConfidence = 'high' | 'medium' | 'low' | 'none';

export type CardMatchResult = {
  /** Confidence in the suggested match. */
  confidence: CardMatchConfidence;
  /** The single best account match — null when there's no match. */
  account?: Account | null;
  /** Other plausible matches (when 2+ accounts have the same last-4). */
  alternates?: Account[];
  /** The 4-digit string we extracted from the receipt, if any. */
  detectedLast4?: string;
  /** Card network we extracted ('visa' / 'mastercard' / etc.), if any. */
  detectedNetwork?: Account['cardNetwork'];
};

/**
 * Common shapes for last-4 on receipts. The order matters — more
 * specific patterns try first to avoid matching transaction IDs or
 * receipt numbers that happen to be 4 digits.
 *
 * Mask characters tolerated:
 *   *       (asterisk, classic ASCII)
 *   X / x   (literal X used by many issuers)
 *   #       (some templates)
 *   •       (U+2022 BULLET, used by Apple Pay receipts, PayPal,
 *            Venmo, modern issuer emails)
 *   ●       (U+25CF BLACK CIRCLE, similar usage)
 *   ·       (U+00B7 MIDDLE DOT, less common but seen on bank PDFs)
 *   .       (period, only when a clear masking run of 3+)
 *
 * The character class `[*xX#•●·]` matches any of those individual
 * mask glyphs. Patterns require at least 2 in a row so we don't
 * misread an asterisk-as-emphasis or single bullet point as a card
 * mask.
 */
const MASK_CHARS = '*xX#•●·';
const MASK_RUN_2 = `[${MASK_CHARS}]{2,}`;
const MASK_RUN_3 = `[${MASK_CHARS}]{3,}`;
const MASK_RUN_4 = `[${MASK_CHARS}]{4}`;
const ACCOUNT_TYPE_WORD = '(?:checking|savings|saving|credit(?:\\s*card)?|debit(?:\\s*card)?|card|acct|account)';

const LAST4_PATTERNS: RegExp[] = [
  // "Card ending in 1234" / "ending 1234"
  /\b(?:card\s+)?(?:ending(?:\s+in)?|ends?\s+in)\s*[#:]?\s*(\d{4})\b/i,
  // "Checking ••5713" / "Savings ••••5713" / "Credit Card ****1234".
  // Optional separator (space, dash, colon) between the type word and
  // the mask run, and between the mask run and the 4 digits. Catches
  // the modern PayPal / Apple Pay / bank-app shape where the mask is
  // a Unicode bullet rather than asterisks.
  new RegExp(`\\b${ACCOUNT_TYPE_WORD}[\\s#:\\-]*${MASK_RUN_2}[\\s\\-]?(\\d{4})\\b`, 'i'),
  // Same as above but with the mask AFTER the digits ("5713 ••••")
  // is rare on US receipts; skip for now.
  // "Card: VISA ****1234" / "Card #****1234" / "Card: ••••5713"
  new RegExp(`(?:card|acct|account)[\\s#:]*[a-z]*[\\s]*${MASK_RUN_2}[\\s\\-]?(\\d{4})\\b`, 'i'),
  // "VISA ****1234" / "MasterCard XXXX1234" / "Visa ••••1234"
  new RegExp(`(?:visa|mastercard|master\\s*card|amex|american\\s*express|discover|debit|credit)\\s*${MASK_RUN_2}[\\s\\-]?(\\d{4})\\b`, 'i'),
  // "************1234" — bare masked PAN
  new RegExp(`${MASK_RUN_3}[\\s\\-]?(\\d{4})\\b`),
  // "XXXX-XXXX-XXXX-1234" — full grouped mask
  new RegExp(`${MASK_RUN_4}[\\s\\-]${MASK_RUN_4}[\\s\\-]${MASK_RUN_4}[\\s\\-](\\d{4})\\b`),
  // "Acct: ...1234" (3+ leading dots)
  /(?:acct|account)\s*[#:]?\s*\.{3,}\s*(\d{4})\b/i,
  // Bare "Checking 5713" / "Savings #5713" / "Acct 5713". Lowest
  // priority because it's the most ambiguous (any 4-digit number
  // after the type word would match). The position-of-LAST-match
  // logic in `extractLast4` keeps the actual payment line over a
  // stray reference earlier in the document.
  new RegExp(`\\b${ACCOUNT_TYPE_WORD}\\s*[#:]?\\s*(\\d{4})\\b`, 'i'),
];

const NETWORK_PATTERNS: Array<{ network: NonNullable<Account['cardNetwork']>; re: RegExp }> = [
  { network: 'visa',       re: /\bvisa\b/i },
  { network: 'mastercard', re: /\bmaster\s*card\b/i },
  { network: 'amex',       re: /\b(?:amex|american\s*express)\b/i },
  { network: 'discover',   re: /\bdiscover\b/i },
];

/**
 * Extract the most likely last-4 from receipt text. Returns the LAST
 * match in the document — receipts typically print the line-items
 * first and the payment summary at the end, so the actual charge
 * appears late.
 */
export function extractLast4(text: string): string | null {
  if (!text) return null;
  // Walk every pattern, collect every position+digit match, take the
  // one with the highest position (latest in the document).
  let best: { idx: number; digits: string } | null = null;
  for (const re of LAST4_PATTERNS) {
    // Build a global version of each pattern for repeated matching.
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const digits = m[1];
      if (!digits || !/^\d{4}$/.test(digits)) continue;
      // Filter out obvious non-card numbers: years, common test
      // values, sequential digits.
      if (/^(19|20)\d{2}$/.test(digits)) continue; // looks like a year
      if (digits === '0000') continue;
      const idx = m.index;
      if (!best || idx > best.idx) best = { idx, digits };
    }
  }
  return best ? best.digits : null;
}

export function extractCardNetwork(text: string): Account['cardNetwork'] | undefined {
  if (!text) return undefined;
  // Take the LAST network mention — same logic as last-4: payment
  // summary is at the bottom.
  let best: { idx: number; network: NonNullable<Account['cardNetwork']> } | null = null;
  for (const { network, re } of NETWORK_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const idx = m.index;
      if (!best || idx > best.idx) best = { idx, network };
    }
  }
  return best?.network;
}

/**
 * Match an extracted last-4 (and optional network) against the user's
 * accounts. Returns the best candidate + confidence.
 *
 * Decision matrix:
 *
 *   - 0 candidates                                      → NONE
 *   - 1 candidate, network matches                      → HIGH
 *   - 1 candidate, no network info on either side       → MEDIUM
 *   - 1 candidate, network mismatch                     → LOW
 *   - 2+ candidates, exactly one network match          → HIGH
 *   - 2+ candidates, no network info to disambiguate    → LOW
 */
export function matchAccountByLast4(
  detectedLast4: string,
  detectedNetwork: Account['cardNetwork'] | undefined,
  accounts: Account[],
): CardMatchResult {
  const candidates = accounts.filter((a) => a.last4 && a.last4 === detectedLast4 && !a.closed);
  if (candidates.length === 0) {
    return {
      confidence: 'none',
      account: null,
      detectedLast4,
      detectedNetwork,
    };
  }
  if (candidates.length === 1) {
    const a = candidates[0];
    if (!detectedNetwork && !a.cardNetwork) {
      return { confidence: 'medium', account: a, detectedLast4, detectedNetwork };
    }
    if (detectedNetwork && a.cardNetwork && detectedNetwork === a.cardNetwork) {
      return { confidence: 'high', account: a, detectedLast4, detectedNetwork };
    }
    if (detectedNetwork && a.cardNetwork && detectedNetwork !== a.cardNetwork) {
      // Same digits, different network. Probably a coincidence —
      // ask the user before assigning.
      return {
        confidence: 'low', account: a, detectedLast4, detectedNetwork,
        alternates: [],
      };
    }
    // One side has network info, the other doesn't. Treat as medium.
    return { confidence: 'medium', account: a, detectedLast4, detectedNetwork };
  }
  // 2+ matches.
  if (detectedNetwork) {
    const netMatches = candidates.filter((a) => a.cardNetwork === detectedNetwork);
    if (netMatches.length === 1) {
      return {
        confidence: 'high',
        account: netMatches[0],
        alternates: candidates.filter((a) => a.id !== netMatches[0].id),
        detectedLast4, detectedNetwork,
      };
    }
  }
  // Couldn't disambiguate — return all candidates with low
  // confidence so the UI prompts the user.
  return {
    confidence: 'low',
    account: candidates[0],
    alternates: candidates.slice(1),
    detectedLast4, detectedNetwork,
  };
}

/**
 * Top-level helper: extract from text + match against accounts. Used
 * by the receipt upload flow.
 */
export function detectAccountFromReceiptText(text: string, accounts: Account[]): CardMatchResult {
  const last4 = extractLast4(text);
  if (!last4) {
    return { confidence: 'none' };
  }
  const network = extractCardNetwork(text);
  return matchAccountByLast4(last4, network, accounts);
}
