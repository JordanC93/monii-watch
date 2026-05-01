/**
 * Gentle 30-day export reminder. Renders on the Budget page only
 * when the user hasn't:
 *   - Manually exported a JSON backup in the last 30 days
 *   - Auto-backed up in the last 30 days
 *   - Been reminded in the last 30 days (so dismissal sticks)
 *
 * Brand-new users (less than 7 days since onboarding) are never
 * prompted — their data set is small + they're still learning the
 * app. Tier 14 (export reminder).
 *
 * Privacy posture: this is purely a nudge to the user to keep their
 * own backup. No data leaves the device.
 */

import { useMemo } from 'react';
import { Download, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';

const REMINDER_INTERVAL_MS = 30 * 86400 * 1000;
const NEW_USER_GRACE_MS = 7 * 86400 * 1000;

export function ExportReminderBanner() {
  const settings = useBudget((s) => s.settings);
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const nav = useNavigate();

  const shouldShow = useMemo(() => {
    if (!settings.onboardingCompleted) return false;
    // Empty data set — no point reminding to back up nothing.
    if (txns.length === 0 || accounts.length === 0) return false;
    const now = Date.now();
    // New-user grace period.
    const earliestSignal = Math.min(
      settings.lastManualExportAt ?? Infinity,
      settings.lastAutoBackupAt ?? Infinity,
      settings.exportReminderShownAt ?? Infinity,
    );
    // No prior signal AND less than 7 days since first install — skip.
    // We approximate "first install" via the trash retention window
    // anchor — auditLog entries are also a proxy. But the cleanest
    // signal is `setupChecklistDismissed`-or-not: someone who hasn't
    // dismissed setup is new.
    if (!settings.setupChecklistDismissed && earliestSignal === Infinity) {
      return false;
    }
    // Recently seen by ANY signal → don't nag.
    const lastExport = settings.lastManualExportAt ?? 0;
    const lastAutoBackup = settings.lastAutoBackupAt ?? 0;
    const lastReminder = settings.exportReminderShownAt ?? 0;
    const mostRecent = Math.max(lastExport, lastAutoBackup, lastReminder);
    if (mostRecent > 0 && now - mostRecent < REMINDER_INTERVAL_MS) return false;
    // First time we'd nag a new user: give them a week to settle in.
    if (mostRecent === 0 && now - (settings.lastOpenedAt || now) < NEW_USER_GRACE_MS) {
      return false;
    }
    return true;
  }, [settings, txns.length, accounts.length]);

  if (!shouldShow) return null;

  function dismiss() {
    setSettingsField('exportReminderShownAt', Date.now());
  }
  function exportNow() {
    setSettingsField('exportReminderShownAt', Date.now());
    nav('/settings#general');
  }

  const lastBackupAt = Math.max(
    settings.lastManualExportAt ?? 0,
    settings.lastAutoBackupAt ?? 0,
  );
  const daysSince = lastBackupAt
    ? Math.floor((Date.now() - lastBackupAt) / 86400000)
    : null;

  return (
    <div className="glass-panel p-3 sm:p-3.5 ring-1 ring-warning/40 flex items-start gap-3">
      <Download size={16} className="text-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium">
          Time for a fresh backup{daysSince !== null && daysSince > 30 ? ` (last one ${daysSince} days ago)` : ''}
        </div>
        <div className="text-[11.5px] text-fg-subtle">
          Monii Watch is local-first — exports are your safety net. We'll quiet down for another 30 days after you back up.
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11.5px]">
          <button
            onClick={exportNow}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25"
          >
            <Download size={11} /> Export now
          </button>
          <button
            onClick={dismiss}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-3 text-fg-muted hover:text-fg"
          >
            <X size={11} /> Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
