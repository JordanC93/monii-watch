import { format, parseISO, addMonths, startOfMonth, endOfMonth, differenceInCalendarMonths } from 'date-fns';

export const DATE_FMT = 'yyyy-MM-dd';

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

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy');
}
export function formatDateShort(iso: string): string {
  return format(parseISO(iso), 'MMM d');
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
