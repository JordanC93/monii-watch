/**
 * Recurrence helpers for scheduled transactions. Pure functions over ISO
 * yyyy-mm-dd date strings — no Yjs, no React.
 */

import { addDays, addWeeks, addMonths, addYears, format, parseISO } from 'date-fns';
import type { RecurrenceFrequency } from './types';
import { DATE_FMT } from './date';

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** Advance `iso` by one period of `freq`. Returns a new ISO yyyy-mm-dd. */
export function advanceDate(iso: string, freq: RecurrenceFrequency): string {
  const d = parseISO(iso);
  switch (freq) {
    case 'daily':    return format(addDays(d, 1), DATE_FMT);
    case 'weekly':   return format(addWeeks(d, 1), DATE_FMT);
    case 'biweekly': return format(addWeeks(d, 2), DATE_FMT);
    case 'monthly':  return format(addMonths(d, 1), DATE_FMT);
    case 'yearly':   return format(addYears(d, 1), DATE_FMT);
  }
}
