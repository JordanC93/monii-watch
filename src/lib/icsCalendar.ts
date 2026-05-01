/**
 * iCalendar (.ics) file generator (Tier 12 #9). When the user marks
 * a subscription as "I'm cancelling," we offer to add a calendar
 * reminder for the cancellation deadline (typically the day before
 * the next charge fires).
 *
 * Pure RFC 5545 — no external library, no external service, no
 * tracking. The browser hands the .ics file to the OS, which
 * imports into Calendar / Outlook / Google Calendar / etc.
 *
 * Supported fields:
 *   - SUMMARY (event title)
 *   - DESCRIPTION (multi-line, escaped)
 *   - DTSTART / DTEND (date-only or datetime)
 *   - VALARM with display action + minutes-before trigger
 *   - URL (cancel link)
 *
 * Stays minimal — we don't try to support recurring events,
 * timezones (we use UTC + floating times), or attendees.
 */

export type CalendarEventInput = {
  /** Event title — shown in the calendar app. */
  title: string;
  /** Free-text description. May contain newlines. */
  description?: string;
  /** ISO yyyy-mm-dd. The event becomes an all-day event. */
  date: string;
  /** Optional URL — typically the cancel page. */
  url?: string;
  /** Minutes-before-trigger for an alarm. Default 60. Set null for no alarm. */
  alarmMinutesBefore?: number | null;
};

/**
 * Render the input as an .ics file body. The caller turns this into
 * a Blob + download.
 */
export function buildIcs(input: CalendarEventInput): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@monii-watch`;
  const dt = input.date.replace(/-/g, '');
  // For all-day events, DTEND is the day AFTER per RFC 5545.
  const next = new Date(input.date + 'T00:00:00');
  next.setDate(next.getDate() + 1);
  const dtEnd = next.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Monii Watch//Monii Watch//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  }
  if (input.url) {
    lines.push(`URL:${escapeText(input.url)}`);
  }
  const alarmMin = input.alarmMinutesBefore === undefined ? 60 : input.alarmMinutesBefore;
  if (alarmMin !== null && alarmMin > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(input.title)}`,
      `TRIGGER:-PT${alarmMin}M`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  // RFC 5545 mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Convenience wrapper that builds the .ics + triggers the OS's
 * download/open flow. On iOS / macOS Safari the file opens directly
 * in Calendar.app; on Android Chrome it downloads. Either way the
 * user gets one tap to add to their calendar.
 */
export function downloadIcs(input: CalendarEventInput, filename = 'reminder.ics'): void {
  const body = buildIcs(input);
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** RFC 5545 text escaping: backslash, comma, semicolon, newlines. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}
