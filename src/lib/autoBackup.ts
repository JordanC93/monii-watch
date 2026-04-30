/**
 * Auto-backup engine (Tier 10 #9).
 *
 * Set-and-forget JSON backups. When `Settings.autoBackupDays > 0`,
 * the app downloads a snapshot on boot if `now - lastAutoBackupAt`
 * exceeds the configured interval. The download path uses the
 * standard browser file-save flow — Tauri / PWA users see the OS
 * file-save behavior, browser users get the file in their Downloads
 * folder.
 *
 * Design notes:
 *   - Runs ONCE per app boot. We don't poll; the user typically
 *     opens the app at least once in a backup window, so once-per-boot
 *     is sufficient.
 *   - Skips entirely when `autoBackupDays` is 0 or unset (default
 *     for friends-and-family installs). The user opts in via
 *     Settings → Backup & Import.
 *   - Capped to 5 entries in `autoBackupHistory`. The Settings
 *     panel can show the recent backup list.
 *   - Won't fire if a manual export happened recently. We check
 *     `lastAutoBackupAt` which is updated ONLY by this engine.
 *     Manual exports leave `lastAutoBackupAt` alone, by design —
 *     the user might do a manual export AND want regular auto
 *     backups for redundancy.
 */

import { exportSnapshot, setSettingsField } from '../db/repo';
import { useBudget } from '../store/budget';

/**
 * Trigger an auto-backup if enabled + due. Returns true if a
 * backup was downloaded, false otherwise.
 */
export function maybeRunAutoBackup(): boolean {
  // Read directly from the store rather than calling getSettings()
  // — we want the latest hydrated state, and this runs after the
  // store is wired.
  const settings = useBudget.getState().settings;
  const days = settings.autoBackupDays ?? 0;
  if (!days || days <= 0) return false;
  const now = Date.now();
  const last = settings.lastAutoBackupAt ?? 0;
  const dueAt = last + days * 86400 * 1000;
  if (now < dueAt) return false;

  try {
    const snap = exportSnapshot();
    const today = new Date().toISOString().slice(0, 10);
    const filename = `monii-watch-auto-${today}.json`;
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    setSettingsField('lastAutoBackupAt', now);
    const history = (settings.autoBackupHistory ?? []).slice();
    history.push({ at: now, filename });
    while (history.length > 5) history.shift();
    setSettingsField('autoBackupHistory', history);
    return true;
  } catch {
    // Stay silent — we don't want a failed backup to break the
    // boot flow. The user will discover the failure when they
    // visit Settings and see the stale lastAutoBackupAt.
    return false;
  }
}

/**
 * Pretty-format the next backup date for the Settings panel.
 * Returns null when auto-backup is disabled.
 */
export function nextBackupAt(autoBackupDays: number, lastAutoBackupAt: number): Date | null {
  if (!autoBackupDays || autoBackupDays <= 0) return null;
  const last = lastAutoBackupAt || Date.now();
  return new Date(last + autoBackupDays * 86400 * 1000);
}
