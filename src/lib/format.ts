import { findCurrency, formatMoney as fmt } from '../domain/money';
import type { Money } from '../domain/types';
import { useBudget } from '../store/budget';

export function useCurrency() {
  const code = useBudget((s) => s.settings.currency);
  return findCurrency(code);
}

export function useFormatMoney() {
  const cur = useCurrency();
  return (cents: Money, opts?: { showSign?: boolean; showCents?: boolean }) => fmt(cents, cur, opts);
}

/**
 * Format an amount in a specific currency code (e.g. an account's `currency`
 * override). Falls back to the budget currency when the code is empty/unknown.
 */
export function formatInCurrency(cents: Money, code: string | undefined, opts?: { showSign?: boolean; showCents?: boolean }): string {
  return fmt(cents, findCurrency(code ?? ''), opts);
}
