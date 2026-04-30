import { describe, expect, it } from 'vitest';
import { parsePriceFromText, parseSinglePrice } from './priceParse';

describe('parsePriceFromText', () => {
  it('returns null for empty input', () => {
    expect(parsePriceFromText('')).toBe(null);
    expect(parsePriceFromText('no money here')).toBe(null);
  });

  it('extracts a single price', () => {
    const r = parsePriceFromText('Price: $99.99');
    expect(r?.cents).toBe(9999);
  });

  it('handles thousands separators', () => {
    const r = parsePriceFromText('$1,299.00');
    expect(r?.cents).toBe(129900);
  });

  it('returns the lowest of multiple prices', () => {
    const r = parsePriceFromText('Was $1,599 — now $1,299');
    expect(r?.cents).toBe(129900);
    expect(r?.originalCents).toBe(159900);
  });

  it('rejects values <$1', () => {
    const r = parsePriceFromText('$0.50 promotion');
    expect(r).toBe(null);
  });

  it('handles pasted product page text with structured data', () => {
    const text = `
      Apple MacBook Air
      $1,299.00
      Save $200
      Was $1,499.00
      In stock
    `;
    const r = parsePriceFromText(text);
    expect(r?.cents).toBe(129900);
    expect(r?.originalCents).toBe(149900);
  });
});

describe('parseSinglePrice', () => {
  it('returns null when no $ pattern', () => {
    expect(parseSinglePrice('set laptop')).toBe(null);
  });
  it('extracts explicit dollar amount', () => {
    expect(parseSinglePrice('set laptop to $1299')).toBe(129900);
    expect(parseSinglePrice('$45.50')).toBe(4550);
  });
});
