import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { initTheme } from './store/theme';
import { initDb, materializeDueScheduled, ensureCreditCardPaymentCategoriesExist, getSettings, autoPurgeOldTrash, repairDanglingReferences } from './db/repo';
import { initPersistence, initSync } from './sync/provider';
import { wireStoreToYjs } from './store/budget';
import { installLogCapture } from './lib/logs';
import { applyHostAttributes } from './lib/device';
import { hasDriveToken } from './sync/localSecrets';

async function bootstrap() {
  // Install log capture FIRST so boot-time errors land in the in-app viewer.
  installLogCapture();
  // Ask the browser to exempt this origin's storage from eviction.
  // IndexedDB holds the ENTIRE budget; without persisted storage, iOS
  // Safari can purge it under storage pressure and browser-tab users
  // hit the 7-day ITP cap. Fire-and-forget — denial is non-fatal.
  try {
    void navigator.storage?.persist?.().then((granted) => {
      if (!granted) console.warn('[storage] persistence not granted — data may be evicted under storage pressure');
    });
  } catch { /* older WebViews lack the API */ }
  initTheme();
  // Apply density preference to <html> so the first paint reflects it.
  const { initDensity } = await import('./lib/density');
  initDensity();
  // Tag the body so CSS can branch on platform — drives macOS sheets and
  // Win/Linux differences. Heuristic: Tauri + Mac UA + fine pointer.
  const isTauriApp = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
  const isMac = /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
  if (isTauriApp && isMac) document.body.setAttribute('data-platform', 'mac-desktop');
  else if (isTauriApp) document.body.setAttribute('data-platform', 'desktop');
  // Stamp `data-host-os` + `data-host-tauri` on <html> so CSS can scope
  // the macOS traffic-light inset and any other host-specific tweaks.
  applyHostAttributes();

  // OAuth callback short-circuit. When this page loads as a Google
  // OAuth redirect (popup window opened by the Drive flow), the URL
  // hash carries `access_token=...`. Lazy-import the handler so the
  // Drive code stays out of the cold-start path for users who don't
  // use Drive sync; this branch never runs for them.
  if (window.opener && window.location.hash.includes('access_token')) {
    const { handleOAuthCallbackIfPresent } = await import('./sync/driveProvider');
    if (handleOAuthCallbackIfPresent()) return; // popup closes itself
  }

  // Order matters: persistence must finish loading before initDb writes
  // defaults (otherwise persisted settings would race with the defaulter),
  // and the store must be wired to Yjs before React renders. v0.7.26
  // removed automatic seeding from initDb — sample data is opt-in via
  // the welcome modal's "Try with sample data" button.
  await initPersistence();
  await initDb();
  wireStoreToYjs();
  // Referential-integrity repair BEFORE the materializer: pauses
  // scheduled templates pointing at deleted accounts (so no ghost
  // transactions get created below) and cleans dangling transfer /
  // link references left by CRDT edit-vs-delete merges.
  try {
    const repaired = repairDanglingReferences();
    if (repaired > 0) console.info(`[repair] fixed ${repaired} dangling reference(s)`);
  } catch (err) {
    console.warn('[repair] integrity pass failed', err);
  }
  // Catch up any scheduled transactions that came due while the app was closed.
  // Idempotent — safe to run on every boot.
  try {
    const created = materializeDueScheduled();
    if (created > 0) console.info(`[scheduled] materialized ${created} transaction(s)`);
  } catch (err) {
    console.warn('[scheduled] materialization failed', err);
  }
  // Tier 6 #1 — fire monthly-1st auto-allocation rules. The rule engine
  // dedups by `lastFiredOn === today` so this is safe to call on every
  // boot; only the first boot of day 01 actually moves money.
  try {
    const { applyAllocationRulesForTrigger } = await import('./db/repo');
    applyAllocationRulesForTrigger('monthly-1st');
  } catch (err) {
    console.warn('[allocation] monthly-1st failed', err);
  }
  // Backfill credit-card payment categories for users upgrading from v0.1.
  try { ensureCreditCardPaymentCategoriesExist(); } catch (err) {
    console.warn('[cc-payments] backfill failed', err);
  }
  // Tier 11 #1 — auto-purge any trash entry older than 30 days.
  try {
    const purged = autoPurgeOldTrash();
    if (purged > 0) console.info(`[trash] auto-purged ${purged} old entries`);
  } catch (err) {
    console.warn('[trash] auto-purge failed', err);
  }
  // Capture today's net-worth snapshot if we don't already have one.
  // Bounded by a 5-year prune; runs once per boot.
  try {
    const { captureSnapshotIfNeeded } = await import('./domain/nwSnapshots');
    const r = captureSnapshotIfNeeded();
    if (r.added) console.info('[nw] snapshot captured for', r.snapshot?.date);
  } catch (err) {
    console.warn('[nw] snapshot failed', err);
  }
  // Eager-construct the UndoManager. A Yjs UndoManager only captures
  // transactions made AFTER it exists — built lazily inside undo(), the
  // first Cmd+Z of every session found an empty stack and everything
  // before it was permanently uncapturable. Constructed here, after the
  // boot-time mutations above, so materialized scheduled txns and other
  // boot writes don't land on the user's undo stack.
  try {
    const { getUndoManager } = await import('./store/undo');
    getUndoManager();
  } catch (err) {
    console.warn('[undo] init failed', err);
  }

  initSync().catch((err) => console.warn('[sync] failed to start', err));

  // Optional Google Drive sync — lazy-imported so it never enters the
  // cold-start bundle for users who haven't opted in. The token is
  // device-local (localSecrets, plain sync localStorage read); the
  // legacy synced-settings check keeps pre-migration docs booting —
  // startDriveSync migrates the token on first run.
  if (getSettings().googleDriveEnabled && (hasDriveToken() || !!getSettings().googleAccessToken)) {
    import('./sync/driveProvider')
      .then((m) => m.startDriveSync())
      .catch((err) => console.warn('[drive] failed to start', err));
  }

  // v0.7.5 — optional Personal Server backup transport. Lazy-imported,
  // opt-in. Same encryption pipeline as Drive; talks to the user's
  // own server instead of Google's.
  if (getSettings().personalBackupEnabled && getSettings().personalBackupUrl && getSettings().syncRoom) {
    import('./sync/personalServerProvider')
      .then((m) => m.startPersonalBackupSync())
      .catch((err) => console.warn('[personal-backup] failed to start', err));
  }

  // Tier 12 #7 — optional iCloud Drive sync (lazy-imported, opt-in,
  // Tauri-only). Reuses the pairing phrase as the encryption key.
  if (getSettings().icloudEnabled && getSettings().icloudFolderPath && getSettings().syncRoom) {
    import('./sync/icloudProvider')
      .then((m) => m.startICloudSync())
      .catch((err) => console.warn('[icloud] failed to start', err));
  }

  // Local notification trigger loop. Always starts; the `notify()` calls
  // it makes are no-ops unless the user has flipped the master switch on.
  // Cheap (~one map walk every 5 minutes), so no harm in always running.
  import('./lib/notify').then((m) => m.startNotificationLoop()).catch(() => {});

  // Tier 10 #9 — auto-backup. No-op when disabled; otherwise downloads
  // a JSON snapshot if `lastAutoBackupAt + autoBackupDays * 86400s` is
  // past. Defer one tick so the React tree mounts first (the download
  // can briefly steal focus on some browsers).
  setTimeout(() => {
    void import('./lib/autoBackup').then((m) => {
      try { m.maybeRunAutoBackup(); } catch (err) {
        console.warn('[auto-backup] failed', err);
      }
    });
  }, 1500);

  // Tier 12 #10 — deal-feed engine. Polls public RSS / Bluesky feeds
  // (Wario64, Slickdeals, Reddit deal subs) and matches posts against
  // per-goal keywords. No-op when no goals have keywords or no feeds
  // are enabled. Visibility-aware: re-polls when the tab regains focus
  // if last poll was > 30 min ago.
  void import('./lib/dealFeedEngine').then((m) => m.startDealFeedEngine()).catch(() => {});

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

/**
 * Boot-crash recovery splash. If `bootstrap()` throws before React
 * renders, the user would otherwise see a blank screen with no path
 * forward. This handler injects a minimal HTML/CSS splash with:
 *
 *   - The error message (so they can paste it for support)
 *   - A "Retry" button that reloads the app
 *   - An "Open data folder" hint pointing at the IndexedDB location
 *   - A clear note that "your data is safe — only the app shell
 *     failed to start"
 *
 * Pure DOM injection — no React, no module dependencies — because
 * if React itself failed to load, importing components would also
 * fail. Style is inline so it works even if globals.css didn't
 * load.
 */
function renderBootCrashSplash(err: unknown): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // Best-effort stack capture for the support-paste flow.
  const stack = err instanceof Error ? err.stack ?? '' : '';
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <div style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0E1117;
      color: #E5E7EB;
    ">
      <div style="max-width: 520px; width: 100%;">
        <div style="
          width: 56px; height: 56px; border-radius: 16px;
          background: linear-gradient(135deg, #f59e0b, #ef4444);
          display: grid; place-items: center;
          margin-bottom: 20px;
          font-size: 28px;
        ">⚠</div>
        <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 600;">
          Monii Watch couldn't start
        </h1>
        <p style="margin: 0 0 16px; color: rgba(229,231,235,0.7); line-height: 1.5;">
          The app shell failed to load. <strong style="color: #34d399;">Your data is safe</strong> — it lives in your browser's IndexedDB and wasn't touched. Try a reload first.
        </p>
        <div style="
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 20px;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12px;
          color: #f87171;
          word-break: break-word;
        ">${escapeHtml(message)}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="boot-retry" style="
            padding: 10px 16px;
            border-radius: 8px;
            background: #7C5CFF;
            color: white;
            border: none;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">Reload app</button>
          <button id="boot-copy" style="
            padding: 10px 16px;
            border-radius: 8px;
            background: rgba(255,255,255,0.08);
            color: #E5E7EB;
            border: 1px solid rgba(255,255,255,0.12);
            font-size: 14px;
            cursor: pointer;
          ">Copy error details</button>
        </div>
        <details style="margin-top: 20px; color: rgba(229,231,235,0.5); font-size: 12px;">
          <summary style="cursor: pointer;">Recovery options</summary>
          <div style="margin-top: 8px; line-height: 1.6;">
            <p style="margin: 4px 0;">If reloading doesn't help:</p>
            <ul style="padding-left: 18px; margin: 4px 0;">
              <li>Force-quit the app and reopen it</li>
              <li>Try opening from a different device that's already paired</li>
              <li>Sign out + back in to your cloud-storage app (if using Cloud folder sync) — sometimes a stale auth token blocks startup</li>
              <li>As a last resort: clear the browser's IndexedDB for this origin and restore from a JSON backup</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  `;
  const retry = document.getElementById('boot-retry');
  if (retry) retry.addEventListener('click', () => window.location.reload());
  const copy = document.getElementById('boot-copy');
  if (copy) {
    copy.addEventListener('click', () => {
      const text = `Monii Watch boot failure\n\n${message}\n\n${stack}`;
      try {
        void navigator.clipboard.writeText(text);
        copy.textContent = 'Copied ✓';
        setTimeout(() => { if (copy) copy.textContent = 'Copy error details'; }, 2000);
      } catch {
        copy.textContent = 'Clipboard unavailable';
      }
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

bootstrap().catch((err) => {
  // The single most-likely silent killer at launch. Without this,
  // any throw during persistence init / Yjs setup / theme load /
  // OAuth callback handling would leave the user staring at a
  // blank screen with no recourse.
  console.error('[bootstrap] failed', err);
  try {
    renderBootCrashSplash(err);
  } catch (renderErr) {
    // If even the splash fails, fall through to the browser's
    // default empty-page behavior. At least the console will
    // have the original error.
    console.error('[bootstrap] splash render also failed', renderErr);
  }
});
