import { format, parseISO, addMonths, startOfMonth, endOfMonth, differenceInCalendarMonths } from 'date-fns';
import type { DateFormat } from './types';

export const DATE_FMT = 'yyyy-MM-dd';

/**
 * v0.7.30 — date-fns format strings per `DateFormat` preference. The
 * SHORT variants drop the year; same overall style as the LONG.
 *
 *   iso  → 2026-05-09 / 05-09
 *   us   → 05/09/2026 / 05/09
 *   eu   → 09/05/2026 / 09/05
 *   long → May 9, 2026 / May 9   (legacy default)
 */
const DATE_PATTERNS: Record<DateFormat, { long: string; short: string }> = {
  iso:  { long: 'yyyy-MM-dd', short: 'MM-dd' },
  us:   { long: 'MM/dd/yyyy', short: 'MM/dd' },
  eu:   { long: 'dd/MM/yyyy', short: 'dd/MM' },
  long: { long: 'MMM d, yyyy', short: 'MMM d' },
};

/** Human label shown next to each `DateFormat` in the picker / onboarding. */
export const DATE_FORMAT_OPTIONS: Array<{ id: DateFormat; label: string; example: string }> = [
  { id: 'us',   label: 'MM/DD/YYYY',   example: '05/09/2026' },
  { id: 'eu',   label: 'DD/MM/YYYY',   example: '09/05/2026' },
  { id: 'iso',  label: 'YYYY-MM-DD',   example: '2026-05-09' },
  { id: 'long', label: 'MMM D, YYYY',  example: 'May 9, 2026' },
];

export function todayIso(): string {
  return format(new Date(), DATE_FMT);
}

export function monthIso(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(date, 'yyyy-MM');
}

export function thisMonthIso(): string {
  return format(new Date(), 'yyyy-MM');
}

export function parseMonth(month: string): Date {
  return parseISO(`${month}-01`);
}

export function shiftMonth(month: string, delta: number): string {
  return monthIso(addMonths(parseMonth(month), delta));
}

export function monthRange(month: string): { start: string; end: string } {
  const d = parseMonth(month);
  return { start: format(startOfMonth(d), DATE_FMT), end: format(endOfMonth(d), DATE_FMT) };
}

export function isoIsInMonth(iso: string, month: string): boolean {
  return iso.startsWith(month);
}

/** Months between (inclusive a, exclusive b). a=2025-03, b=2025-06 -> 3 */
export function monthsBetween(a: string, b: string): number {
  return differenceInCalendarMonths(parseMonth(b), parseMonth(a));
}

export function formatMonthLong(month: string): string {
  return format(parseMonth(month), 'MMMM yyyy');
}
export function formatMonthShort(month: string): string {
  return format(parseMonth(month), 'MMM yyyy');
}

/**
 * v0.7.30 — both `formatDate` and `formatDateShort` accept an optional
 * `DateFormat` argument. Omitted ⇒ `'long'` (the legacy `MMM d, yyyy`
 * format), so every existing callsite keeps working without changes.
 * Settings-aware UI should call the `useFormatDate` / `useFormatDateShort`
 * hooks in `lib/format.ts` instead, which pull the user's preference
 * from the store.
 */
export function formatDate(iso: string, fmt: DateFormat = 'long'): string {
  return format(parseISO(iso), DATE_PATTERNS[fmt].long);
}
export function formatDateShort(iso: string, fmt: DateFormat = 'long'): string {
  return format(parseISO(iso), DATE_PATTERNS[fmt].short);
}

/** Add (or subtract) calendar days from an ISO date string. */
export function isoAddDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return format(d, DATE_FMT);
}

/** Inclusive range check: is `iso` between `from` and `to`? Both ISO yyyy-mm-dd. */
export function isoBetween(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to;
}
