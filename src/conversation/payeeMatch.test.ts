/**
 * Coverage for the fuzzy payee matcher (v0.7.21).
 *
 * The matcher's job is to surface "did you mean an existing payee?"
 * when a parsed receipt vendor is close-but-not-identical to one
 * already on file. Below the 70% confidence floor it stays quiet.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeVendorName,
  vendorMatchScore,
  findFuzzyPayeeMatch,
  MATCH_THRESHOLD,
} from './payeeMatch';
import type { Payee } from '../domain/types';

const payee = (id: string, name: string): Payee => ({ id, name });

describe('normalizeVendorName', () => {
  it('lowercases and trims', () => {
    expect(normalizeVendorName('  Starbucks  ')).toBe('starbucks');
  });

  it('strips trailing ellipsis from truncated names', () => {
    expect(normalizeVendorName('Starbucks Coffee Com...')).toBe('starbucks coffee com');
  });

  it('drops payment-processor noise tokens', () => {
    expect(normalizeVendorName('Starbucks Inc')).toBe('starbucks');
    expect(normalizeVendorName('Apple Inc.')).toBe('apple');
    expect(normalizeVendorName('Recurring Netflix Payment')).toBe('netflix');
    expect(normalizeVendorName('The Home Depot')).toBe('home depot');
  });

  it('strips long digit runs (transaction IDs)', () => {
    expect(normalizeVendorName('Starbucks #04321')).toBe('starbucks');
    expect(normalizeVendorName('AMZN Mktp 998877')).toBe('amzn mktp');
  });

  it('strips mixed alphanum codes', () => {
    expect(normalizeVendorName('Amazon.com*M12RT89')).toBe('amazon com');
    // A long alphanum token following the brand should be dropped.
    expect(normalizeVendorName('Spotify USA*XYZ123')).toBe('spotify');
  });

  it('handles PayPal/Square wrappers', () => {
    // Punctuation is split. The word "paypal" is not in NOISE_TOKENS
    // so it remains; matching by token overlap will still succeed
    // ("uber" appears in both "paypal uber" and the existing payee).
    expect(normalizeVendorName('PAYPAL *UBER 7724')).toBe('paypal uber');
  });

  it('returns empty for unparseable input', () => {
    expect(normalizeVendorName('')).toBe('');
    expect(normalizeVendorName('   ')).toBe('');
    expect(normalizeVendorName('#####')).toBe('');
  });
});

describe('vendorMatchScore', () => {
  it('exact match scores 1', () => {
    expect(vendorMatchScore('starbucks', 'starbucks')).toBe(1);
  });

  it('token-aligned prefix scores high', () => {
    // "starbucks" is a clean prefix of "starbucks coffee com" with
    // a space at the boundary — should be well above the threshold.
    expect(vendorMatchScore('starbucks coffee com', 'starbucks')).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('rejects partial-word prefix to avoid coincidence matches', () => {
    // "star" is a prefix of "starbucks" by literal substring but NOT
    // a token-aligned prefix (next char is "b", not whitespace).
    // Should fall back to the token overlap path which scores 0
    // because there are no shared tokens.
    expect(vendorMatchScore('starbucks', 'star')).toBeLessThan(MATCH_THRESHOLD);
  });

  it('first-token match boosts but is still below the prefix path', () => {
    // Different brand/product names with a shared first word.
    // Should still be above threshold for the maintainer's "70% bar".
    const score = vendorMatchScore('starbucks coffee', 'starbucks pike place');
    expect(score).toBeGreaterThan(MATCH_THRESHOLD);
    expect(score).toBeLessThan(0.95);
  });

  it('unrelated names score 0', () => {
    expect(vendorMatchScore('starbucks', 'walmart')).toBe(0);
    expect(vendorMatchScore('starbucks coffee', 'amazon prime')).toBe(0);
  });

  it('empty inputs score 0', () => {
    expect(vendorMatchScore('', 'starbucks')).toBe(0);
    expect(vendorMatchScore('starbucks', '')).toBe(0);
  });
});

describe('findFuzzyPayeeMatch', () => {
  const payees = [
    payee('p1', 'Starbucks'),
    payee('p2', 'Walmart'),
    payee('p3', 'Amazon'),
  ];

  it('returns the matching payee for a truncated name', () => {
    const r = findFuzzyPayeeMatch('Starbucks Coffee Com...', payees);
    expect(r).not.toBeNull();
    expect(r?.payee.id).toBe('p1');
    expect(r?.score).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('returns null when the parsed name exactly matches an existing payee', () => {
    // Exact matches are handled by ensurePayee silently — no point
    // prompting the user to confirm something the system already did.
    expect(findFuzzyPayeeMatch('Starbucks', payees)).toBeNull();
    expect(findFuzzyPayeeMatch('STARBUCKS', payees)).toBeNull();
    expect(findFuzzyPayeeMatch('  starbucks  ', payees)).toBeNull();
  });

  it('returns null when no payee comes close enough', () => {
    expect(findFuzzyPayeeMatch('Costco Wholesale', payees)).toBeNull();
    expect(findFuzzyPayeeMatch('Random Merchant', payees)).toBeNull();
  });

  it('returns the highest-scoring match when multiple candidates exist', () => {
    const ambiguous = [
      payee('p1', 'Starbucks'),
      payee('p2', 'Starbucks Coffee'),
    ];
    const r = findFuzzyPayeeMatch('Starbucks Coffee Com...', ambiguous);
    expect(r).not.toBeNull();
    // "starbucks coffee" is a longer prefix-aligned match than just
    // "starbucks", so it scores higher.
    expect(r?.payee.id).toBe('p2');
  });

  it('returns null with no payees', () => {
    expect(findFuzzyPayeeMatch('Starbucks', [])).toBeNull();
  });

  it('handles the verbatim PayPal title the maintainer pasted', () => {
    // Title PayPal renders: "You authorized $6.80 USD to Starbucks
    // Coffee Com..." — the OCR'd vendor token is the truncated
    // "Starbucks Coffee Com...". Should resolve to the existing
    // single-word "Starbucks" payee.
    const r = findFuzzyPayeeMatch('Starbucks Coffee Com...', payees);
    expect(r?.payee.name).toBe('Starbucks');
  });
});
