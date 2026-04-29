/**
 * Local notifications. Pure client-side — no push server, no backend.
 *
 * Permission flow:
 *   - User toggles `Settings.notificationsEnabled` ON.
 *   - The first call to `notify()` after that requests browser
 *     permission via `Notification.requestPermission()`.
 *   - When permission is granted, `notify()` shows a system
 *     notification. When denied, it falls back to an in-app toast so
 *     the user still gets the signal.
 *
 * Trigger checks run on app boot AND every 5 minutes while the app is
 * open. While the app is closed on iOS PWA, no notifications fire
 * (iOS limitation — there is no background JavaScript without a push
 * server). The native iOS app target gets system local notifications
 * via Tauri's notification plugin in the future.
 *
 * Dedup is best-effort: every notification has a key, and we won't
 * fire the same key twice within the same browser session. So opening
 * the app twice won't double-notify the same overdue bill.
 */

import { useBudget } from '../store/budget';
import { computeMonthBudget, computeMonthStats } from '../domain/budget';
import { thisMonthIso, todayIso } from '../domain/date';
import { toast } from './toast';

const FIRED_KEYS = new Set<string>();
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let _intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Try to show a system notification. Falls back to in-app toast. */
export async function notify(title: string, opts: {
  body?: string;
  /** Stable identity so we dedup within a session. */
  tag?: string;
  /** Renotify even if a notification with the same tag exists. */
  renotify?: boolean;
  /** Click handler — called when the user taps the notification (system or toast). */
  onClick?: () => void;
} = {}): Promise<void> {
  const tag = opts.tag ?? `${title}|${opts.body ?? ''}`;
  if (FIRED_KEYS.has(tag) && !opts.renotify) return;
  FIRED_KEYS.add(tag);

  // Permission check.
  if (typeof Notification === 'undefined') {
    toast.success(opts.body ? `${title} — ${opts.body}` : title);
    return;
  }
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body: opts.body,
        tag,
        icon: '/apple-touch-icon-180x180.png',
      });
      if (opts.onClick) {
        n.onclick = () => { window.focus(); opts.onClick?.(); };
      }
      return;
    } catch {
      // Fall through to toast on any failure.
    }
  }
  // Denied or default-after-prompt — toast fallback.
  toast.success(opts.body ? `${title} — ${opts.body}` : title);
}

/** Ask for notification permission once. Returns the resulting state. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try { return await Notification.requestPermission(); }
  catch { return 'denied'; }
}

/** True when the runtime supports the Notification API. */
export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

// ---- Trigger logic -----------------------------------------------------

/**
 * Run all trigger checks once. Called on app boot (after a small delay
 * so observers are ready) and every CHECK_INTERVAL_MS while the app is
 * open. Idempotent — won't refire keyed notifications already shown
 * this session.
 */
export function runNotificationChecks(): void {
  const s = useBudget.getState();
  if (!s.settings.notificationsEnabled) return;

  // 1. Bills due in the next N days (from scheduled transactions that
  //    are not paused and have a nextDate within the window).
  if (s.settings.notifyBillsDaysAhead > 0) {
    const today = todayIso();
    const cutoff = addDaysIso(today, s.settings.notifyBillsDaysAhead);
    for (const sch of s.scheduled) {
      if (sch.paused) continue;
      if (!sch.nextDate || sch.nextDate < today) continue;
      if (sch.nextDate > cutoff) continue;
      if (sch.amount >= 0) continue; // skip income templates — those are good news, not reminders
      const payee = s.payees.find((p) => p.id === sch.payeeId);
      void notify('Bill due soon', {
        body: `${payee?.name ?? 'Scheduled bill'}: ${formatCents(Math.abs(sch.amount))} on ${sch.nextDate}`,
        tag: `bill-due:${sch.id}:${sch.nextDate}`,
      });
    }
  }

  // 2. Categories overspent this month.
  if (s.settings.notifyOverspending) {
    const month = thisMonthIso();
    const monthBudget = computeMonthBudget(s.accounts, s.categories, s.transactions, s.assignments, month);
    for (const [catId, row] of monthBudget) {
      if (row.available < 0) {
        const cat = s.categories.find((c) => c.id === catId);
        if (!cat || cat.hidden) continue;
        void notify('Category overspent', {
          body: `${cat.name} is ${formatCents(-row.available)} over for this month.`,
          tag: `overspent:${catId}:${month}`,
        });
      }
    }
  }

  // 3. Goal "deal alert" — surfaced when current item price ≤ funds available.
  //    The Goals page renders this in-app; here we additionally fire a
  //    notification once per (goal, week) so the user sees it on the
  //    lock screen too.
  if (s.settings.notifyGoalDeals) {
    const month = thisMonthIso();
    const monthBudget = computeMonthBudget(s.accounts, s.categories, s.transactions, s.assignments, month);
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    for (const cat of s.categories) {
      const row = monthBudget.get(cat.id);
      if (!row) continue;
      const cur = cat.currentItemPrice;
      const silence = cat.priceAlertSilenceUntil ?? 0;
      if (!cur || cur <= 0) continue;
      if (Date.now() < silence) continue;
      if (row.available < cur) continue;
      void notify('Deal alert', {
        body: `${cat.name} is at ${formatCents(cur)} — you have ${formatCents(row.available)} available.`,
        tag: `deal:${cat.id}:${week}`,
      });
    }
  }

  // 4. Month-start summary — first run in a new month, summarize last month.
  if (s.settings.notifyMonthStart) {
    const today = todayIso();
    const day = parseInt(today.slice(8, 10), 10);
    if (day === 1) {
      const lastMonth = shiftMonthIso(today.slice(0, 7), -1);
      const stats = computeMonthStats(s.accounts, s.transactions, lastMonth);
      void notify(`${formatMonth(lastMonth)} wrap-up`, {
        body: `Income ${formatCents(stats.income)} · Spent ${formatCents(stats.spent)} · Net ${stats.net >= 0 ? '+' : ''}${formatCents(stats.net)}`,
        tag: `month-start:${lastMonth}`,
      });
    }
  }
}

/** Start the periodic trigger loop. Idempotent. */
export function startNotificationLoop(): void {
  if (_intervalHandle) return;
  // Initial run after 10s — avoids slamming the user the moment they open the app.
  setTimeout(() => { runNotificationChecks(); }, 10_000);
  _intervalHandle = setInterval(() => { runNotificationChecks(); }, CHECK_INTERVAL_MS);
}

export function stopNotificationLoop(): void {
  if (_intervalHandle) { clearInterval(_intervalHandle); _intervalHandle = null; }
}

// ---- Local helpers (avoid pulling in money.ts/date.ts more than needed) --

function formatCents(c: number): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}$${whole.toLocaleString()}.${String(frac).padStart(2, '0')}`;
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function shiftMonthIso(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonth(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${y}`;
}
