import { describe, expect, it } from 'vitest';
import { evalCalc, parseAmountToCents } from './calc';

describe('evalCalc — fast number path', () => {
  it('parses plain numbers', () => {
    expect(evalCalc('42')).toBe(42);
    expect(evalCalc('1.23')).toBe(1.23);
    expect(evalCalc('0')).toBe(0);
    expect(evalCalc('-5')).toBe(-5);
  });
  it('returns null on empty input', () => {
    expect(evalCalc('')).toBe(null);
    expect(evalCalc('   ')).toBe(null);
  });
});

describe('evalCalc — calculator expressions', () => {
  it('handles addition and subtraction', () => {
    expect(evalCalc('10 + 5')).toBe(15);
    expect(evalCalc('10 - 5')).toBe(5);
    expect(evalCalc('10+5-3')).toBe(12);
  });
  it('handles multiplication and division', () => {
    expect(evalCalc('10 * 5')).toBe(50);
    expect(evalCalc('100 / 4')).toBe(25);
  });
  it('honors operator precedence', () => {
    expect(evalCalc('2 + 3 * 4')).toBe(14);
    expect(evalCalc('(2 + 3) * 4')).toBe(20);
  });
  it('handles decimals in arithmetic', () => {
    expect(evalCalc('23.45 + 10.50')).toBeCloseTo(33.95);
    expect(evalCalc('100.00 - 0.01')).toBeCloseTo(99.99);
  });
  it('handles unary minus', () => {
    expect(evalCalc('-5 + 10')).toBe(5);
    expect(evalCalc('10 + -3')).toBe(7);
  });
  it('strips currency symbols and commas', () => {
    expect(evalCalc('$1,000 + $250')).toBe(1250);
    expect(evalCalc('€100 + €50')).toBe(150);
  });
  it('returns null for malformed expressions', () => {
    expect(evalCalc('10 +')).toBe(null);
    expect(evalCalc('+ 5')).toBeCloseTo(5); // unary plus is valid
    expect(evalCalc('(10')).toBe(null);
    expect(evalCalc('abc')).toBe(null);
    expect(evalCalc('10 / 0')).toBe(null); // Infinity is rejected
  });
});

describe('evalCalc — percent shortcut', () => {
  it('adds a percent: 45.00 +18% = 53.10', () => {
    expect(evalCalc('45.00 +18%')).toBeCloseTo(53.10);
    expect(evalCalc('45+18%')).toBeCloseTo(53.10);
  });
  it('subtracts a percent: 100 -15% = 85', () => {
    expect(evalCalc('100 -15%')).toBeCloseTo(85);
  });
  it('handles fractional percent', () => {
    expect(evalCalc('100 +8.5%')).toBeCloseTo(108.5);
  });
  it('does not fire on bare percents', () => {
    expect(evalCalc('18%')).toBe(null); // not <num><sign><pct>%
  });
});

describe('parseAmountToCents', () => {
  it('returns cents from a plain number', () => {
    expect(parseAmountToCents('1.23')).toBe(123);
    expect(parseAmountToCents('100')).toBe(10000);
  });
  it('returns cents from a calculator expression', () => {
    expect(parseAmountToCents('23.45 + 10.50')).toBe(3395);
  });
  it('returns null when the input cannot parse', () => {
    expect(parseAmountToCents('abc')).toBe(null);
    expect(parseAmountToCents('')).toBe(null);
  });
  it('handles tip percent', () => {
    expect(parseAmountToCents('45.00 +18%')).toBe(5310);
  });
});
