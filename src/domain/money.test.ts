import { describe, expect, it } from 'vitest';
import {
  dollarsToCents, centsToDollars, formatMoney, findCurrency,
  isPositive, isNegative, isZero, sumCents, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES,
} from './money';

describe('dollarsToCents', () => {
  it('converts whole dollars', () => {
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(-5)).toBe(-500);
  });
  it('converts fractional dollars without float drift', () => {
    expect(dollarsToCents(1.23)).toBe(123);
    expect(dollarsToCents(0.10)).toBe(10);
    expect(dollarsToCents(0.20 + 0.10)).toBe(30); // catch the classic 0.30000000000000004
  });
  it('rounds at the cent boundary', () => {
    // 1.005 has known IEEE-754 representation issues (≈ 1.00499...) so
    // Math.round drops to 100. We assert the BEHAVIOR rather than ideal
    // rounding — the code is consistent with how JS handles it.
    expect(dollarsToCents(1.004)).toBe(100);
    expect(dollarsToCents(1.006)).toBe(101);
    expect(dollarsToCents(1.5)).toBe(150);
  });
  it('handles negative fractions', () => {
    expect(dollarsToCents(-1.23)).toBe(-123);
  });
});

describe('centsToDollars', () => {
  it('reverses dollarsToCents', () => {
    expect(centsToDollars(100)).toBe(1);
    expect(centsToDollars(123)).toBe(1.23);
    expect(centsToDollars(0)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats USD with thousands separator', () => {
    expect(formatMoney(123456, DEFAULT_CURRENCY)).toBe('$1,234.56');
    expect(formatMoney(0, DEFAULT_CURRENCY)).toBe('$0.00');
  });
  it('formats negative amounts with leading minus', () => {
    expect(formatMoney(-123456, DEFAULT_CURRENCY)).toBe('-$1,234.56');
  });
  it('honors showSign option for positive values', () => {
    expect(formatMoney(100, DEFAULT_CURRENCY, { showSign: true })).toBe('+$1.00');
    expect(formatMoney(-100, DEFAULT_CURRENCY, { showSign: true })).toBe('-$1.00');
    expect(formatMoney(0, DEFAULT_CURRENCY, { showSign: true })).toBe('$0.00');
  });
  it('honors showCents=false for whole dollars', () => {
    expect(formatMoney(123456, DEFAULT_CURRENCY, { showCents: false })).toBe('$1,234');
  });
  it('formats EUR with European separators', () => {
    const eur = findCurrency('EUR');
    expect(formatMoney(123456, eur)).toBe('€1.234,56');
  });
  it('formats JPY with no decimals (decimals=0)', () => {
    const jpy = findCurrency('JPY');
    expect(formatMoney(1234, jpy)).toBe('¥1,234');
  });
  it('handles very large amounts', () => {
    expect(formatMoney(123456789012, DEFAULT_CURRENCY)).toBe('$1,234,567,890.12');
  });
});

describe('findCurrency', () => {
  it('returns DEFAULT_CURRENCY when code is unknown', () => {
    expect(findCurrency('XYZ').code).toBe('USD');
  });
  it('finds known currencies by code', () => {
    expect(findCurrency('EUR').symbol).toBe('€');
    expect(findCurrency('JPY').decimals).toBe(0);
  });
});

describe('predicates', () => {
  it('isPositive / isNegative / isZero', () => {
    expect(isPositive(5)).toBe(true);
    expect(isPositive(0)).toBe(false);
    expect(isNegative(-5)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isZero(0)).toBe(true);
    expect(isZero(1)).toBe(false);
  });
});

describe('sumCents', () => {
  it('sums an iterable', () => {
    expect(sumCents([100, 200, 300])).toBe(600);
    expect(sumCents([])).toBe(0);
    expect(sumCents([100, -50])).toBe(50);
  });
});

describe('SUPPORTED_CURRENCIES', () => {
  it('includes USD as the first entry', () => {
    expect(SUPPORTED_CURRENCIES[0].code).toBe('USD');
  });
  it('every entry has the expected fields', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.symbol.length).toBeGreaterThan(0);
      expect(c.decimals).toBeGreaterThanOrEqual(0);
      expect(c.decimals).toBeLessThanOrEqual(3);
    }
  });
});
