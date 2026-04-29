/**
 * Desktop auto-updater bridge. Hides the Tauri-only API behind a
 * runtime feature check so the same code runs in PWA/web contexts
 * (where it's a no-op) and in the desktop shell (where it talks to
 * the `tauri-plugin-updater` plugin).
 *
 * The plugin reads its endpoint(s) and verification public key from
 * `src-tauri/tauri.conf.json` → `plugins.updater`. See
 * `docs/INSTALL.md` for the release-and-sign workflow that produces
 * the `latest.json` manifest GitHub Releases serves.
 *
 * Modular: when no key is configured, the plugin still loads but
 * returns an error on `check()` — we surface that as "Updates not
 * configured" rather than crashing.
 */

export type UpdateStatus =
  | { kind: 'web' }                  // running in a browser, not the desktop app
  | { kind: 'idle' }                 // desktop app, no check yet
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; notes: string; date: string | null }
  | { kind: 'downloading'; downloaded: number; total: number | null }
  | { kind: 'installing' }
  | { kind: 'restart-required' }
  | { kind: 'error'; message: string };

/** True when the runtime is the Tauri DESKTOP shell.
 *
 * iOS / Android Tauri builds also set `__TAURI_INTERNALS__`, but the
 * in-app updater is a no-op there — iOS distributes via App Store /
 * TestFlight and we exclude the updater plugin from those targets in
 * Cargo.toml. We sniff the user-agent to keep the Updates panel hidden
 * on mobile shells too.
 */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (!(w.__TAURI_INTERNALS__ || w.__TAURI__)) return false;
  const ua = navigator.userAgent;
  // iOS WebKit / Android WebView markers — exclude them.
  if (/iPhone|iPad|iPod|Android/.test(ua)) return false;
  return true;
}

/** Check for an update. Returns the latest status. */
export async function checkForUpdate(
  onStatus?: (s: UpdateStatus) => void,
): Promise<UpdateStatus> {
  if (!isDesktopApp()) {
    const s: UpdateStatus = { kind: 'web' };
    onStatus?.(s);
    return s;
  }
  try {
    onStatus?.({ kind: 'checking' });
    // Lazy-import so PWA bundles never load Tauri JS bridges.
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      const s: UpdateStatus = { kind: 'up-to-date' };
      onStatus?.(s);
      return s;
    }
    const s: UpdateStatus = {
      kind: 'available',
      version: update.version,
      notes: update.body ?? '',
      date: update.date ?? null,
    };
    onStatus?.(s);
    return s;
  } catch (err: any) {
    const s: UpdateStatus = { kind: 'error', message: err?.message ?? String(err) };
    onStatus?.(s);
    return s;
  }
}

/**
 * Download + install the available update, then restart the app.
 *
 * Reports progress via `onStatus` so the UI can show a download bar.
 * After install, the app calls `relaunch()` from `@tauri-apps/plugin-process`,
 * which closes the current window and launches the freshly installed
 * binary. The user briefly sees the dock/start-menu launcher animation.
 */
export async function installUpdate(
  onStatus?: (s: UpdateStatus) => void,
): Promise<void> {
  if (!isDesktopApp()) {
    onStatus?.({ kind: 'web' });
    return;
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      onStatus?.({ kind: 'up-to-date' });
      return;
    }
    let downloaded = 0;
    let total: number | null = null;

    onStatus?.({ kind: 'downloading', downloaded: 0, total: null });

    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? null;
        onStatus?.({ kind: 'downloading', downloaded: 0, total });
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        onStatus?.({ kind: 'downloading', downloaded, total });
      } else if (event.event === 'Finished') {
        onStatus?.({ kind: 'installing' });
      }
    });

    onStatus?.({ kind: 'restart-required' });

    // Relaunch into the new binary. Some platforms (notably macOS) require
    // a brief delay so the install handler can finish flushing.
    const { relaunch } = await import('@tauri-apps/plugin-process');
    setTimeout(() => { void relaunch(); }, 250);
  } catch (err: any) {
    onStatus?.({ kind: 'error', message: err?.message ?? String(err) });
  }
}

/** Format bytes as KB/MB/GB. Used in the download progress label. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
