/**
 * Recurrence helpers for scheduled transactions. Pure functions over ISO
 * yyyy-mm-dd date strings — no Yjs, no React.
 */

import { addDays, addWeeks, addMonths, addYears, format, getDaysInMonth, parseISO } from 'date-fns';
import type { RecurrenceFrequency } from './types';
import { DATE_FMT } from './date';

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/**
 * Advance `iso` by one period of `freq`. Returns a new ISO yyyy-mm-dd.
 *
 * `anchorDay` (monthly/yearly only) is the schedule's intended day-of-month.
 * Without it, iterating from a clamped date drifts permanently
 * (Jan 31 → Feb 28 → Mar 28 forever); with it, each result snaps back to
 * min(anchorDay, days in result month) so Mar becomes the 31st again.
 */
export function advanceDate(iso: string, freq: RecurrenceFrequency, anchorDay?: number): string {
  const d = parseISO(iso);
  switch (freq) {
    case 'daily':    return format(addDays(d, 1), DATE_FMT);
    case 'weekly':   return format(addWeeks(d, 1), DATE_FMT);
    case 'biweekly': return format(addWeeks(d, 2), DATE_FMT);
    case 'monthly':  return format(applyAnchorDay(addMonths(d, 1), anchorDay), DATE_FMT);
    case 'yearly':   return format(applyAnchorDay(addYears(d, 1), anchorDay), DATE_FMT);
  }
}

function applyAnchorDay(d: Date, anchorDay?: number): Date {
  if (!anchorDay || anchorDay < 1) return d;
  d.setDate(Math.min(anchorDay, getDaysInMonth(d)));
  return d;
}
