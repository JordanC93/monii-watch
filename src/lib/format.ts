import { findCurrency, formatMoney as fmt } from '../domain/money';
import { formatDate as fmtDate, formatDateShort as fmtDateShort } from '../domain/date';
import type { DateFormat, Money } from '../domain/types';
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
 * v0.7.30 — settings-aware date formatter. Reads `Settings.dateFormat`
 * (defaults to `'long'` when unset so existing users keep "May 9, 2026"
 * until they pick another option). Use anywhere the app renders a date
 * as text — transaction lists, import preview, schedule list, reports.
 */
export function useFormatDate() {
  const fmt = useBudget((s) => s.settings.dateFormat) as DateFormat | undefined;
  const effective: DateFormat = fmt ?? 'long';
  return (iso: string) => fmtDate(iso, effective);
}

/** Same as `useFormatDate` but drops the year. Used in chart axis labels,
 *  detail panes, and anywhere terse dates fit better than full ones. */
export function useFormatDateShort() {
  const fmt = useBudget((s) => s.settings.dateFormat) as DateFormat | undefined;
  const effective: DateFormat = fmt ?? 'long';
  return (iso: string) => fmtDateShort(iso, effective);
}

/**
 * Format an amount in a specific currency code (e.g. an account's `currency`
 * override). Falls back to the budget currency when the code is empty/unknown.
 */
export function formatInCurrency(cents: Money, code: string | undefined, opts?: { showSign?: boolean; showCents?: boolean }): string {
  return fmt(cents, findCurrency(code ?? ''), opts);
}
