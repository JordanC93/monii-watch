/**
 * Money helpers. We store amounts as integer cents (Money = number).
 * Never use floats for arithmetic — always work with integers, format to display.
 */

import type { Money } from './types';

export function dollarsToCents(dollars: number): Money {
  // Use rounding to nearest cent to avoid float drift.
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: Money): number {
  return cents / 100;
}

export type Currency = {
  code: string;
  symbol: string;
  symbolBefore: boolean;
  /** Number of decimal places. JPY = 0, USD = 2, BHD = 3 */
  decimals: number;
  thousandsSep: string;
  decimalSep: string;
};

export const DEFAULT_CURRENCY: Currency = {
  code: 'USD',
  symbol: '$',
  symbolBefore: true,
  decimals: 2,
  thousandsSep: ',',
  decimalSep: '.',
};

export const SUPPORTED_CURRENCIES: Currency[] = [
  DEFAULT_CURRENCY,
  { code: 'EUR', symbol: '€', symbolBefore: true,  decimals: 2, thousandsSep: '.', decimalSep: ',' },
  { code: 'GBP', symbol: '£', symbolBefore: true,  decimals: 2, thousandsSep: ',', decimalSep: '.' },
  { code: 'CAD', symbol: '$', symbolBefore: true,  decimals: 2, thousandsSep: ',', decimalSep: '.' },
  { code: 'AUD', symbol: '$', symbolBefore: true,  decimals: 2, thousandsSep: ',', decimalSep: '.' },
  { code: 'JPY', symbol: '¥', symbolBefore: true,  decimals: 0, thousandsSep: ',', decimalSep: '.' },
  { code: 'INR', symbol: '₹', symbolBefore: true,  decimals: 2, thousandsSep: ',', decimalSep: '.' },
  { code: 'BRL', symbol: 'R$', symbolBefore: true, decimals: 2, thousandsSep: '.', decimalSep: ',' },
  { code: 'MXN', symbol: '$', symbolBefore: true,  decimals: 2, thousandsSep: ',', decimalSep: '.' },
];

export function findCurrency(code: string): Currency {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? DEFAULT_CURRENCY;
}

/** Format cents as a localized money string. Negative amounts render with a leading minus. */
export function formatMoney(cents: Money, currency: Currency = DEFAULT_CURRENCY, opts: { showSign?: boolean; showCents?: boolean } = {}): string {
  const { showSign = false, showCents = true } = opts;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const factor = Math.pow(10, currency.decimals);
  const whole = Math.floor(abs / factor);
  const frac = abs % factor;

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandsSep);
  const fracStr = currency.decimals > 0 && showCents
    ? currency.decimalSep + frac.toString().padStart(currency.decimals, '0')
    : '';

  const num = wholeStr + fracStr;
  const sym = currency.symbol;
  const body = currency.symbolBefore ? `${sym}${num}` : `${num}${sym}`;

  if (negative) return `-${body}`;
  if (showSign && cents > 0) return `+${body}`;
  return body;
}

export function isPositive(c: Money): boolean { return c > 0; }
export function isNegative(c: Money): boolean { return c < 0; }
export function isZero(c: Money): boolean { return c === 0; }

export function sumCents(xs: Iterable<Money>): Money {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}
