import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { initTheme } from './store/theme';
import { initDb, materializeDueScheduled, ensureCreditCardPaymentCategoriesExist, getSettings } from './db/repo';
import { initPersistence, initSync } from './sync/provider';
import { wireStoreToYjs } from './store/budget';
import { installLogCapture } from './lib/logs';

async function bootstrap() {
  // Install log capture FIRST so boot-time errors land in the in-app viewer.
  installLogCapture();
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

  // OAuth callback short-circuit. When this page loads as a Google
  // OAuth redirect (popup window opened by the Drive flow), the URL
  // hash carries `access_token=...`. Lazy-import the handler so the
  // Drive code stays out of the cold-start path for users who don't
  // use Drive sync; this branch never runs for them.
  if (window.opener && window.location.hash.includes('access_token')) {
    const { handleOAuthCallbackIfPresent } = await import('./sync/driveProvider');
    if (handleOAuthCallbackIfPresent()) return; // popup closes itself
  }

  // Order matters: persistence must finish loading before seed runs, and
  // store must wire to Yjs before React renders.
  await initPersistence();
  await initDb();
  wireStoreToYjs();
  // Catch up any scheduled transactions that came due while the app was closed.
  // Idempotent — safe to run on every boot.
  try {
    const created = materializeDueScheduled();
    if (created > 0) console.info(`[scheduled] materialized ${created} transaction(s)`);
  } catch (err) {
    console.warn('[scheduled] materialization failed', err);
  }
  // Backfill credit-card payment categories for users upgrading from v0.1.
  try { ensureCreditCardPaymentCategoriesExist(); } catch (err) {
    console.warn('[cc-payments] backfill failed', err);
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
  initSync().catch((err) => console.warn('[sync] failed to start', err));

  // Optional Google Drive sync — lazy-imported so it never enters the
  // cold-start bundle for users who haven't opted in.
  if (getSettings().googleDriveEnabled && getSettings().googleAccessToken) {
    import('./sync/driveProvider')
      .then((m) => m.startDriveSync())
      .catch((err) => console.warn('[drive] failed to start', err));
  }

  // Local notification trigger loop. Always starts; the `notify()` calls
  // it makes are no-ops unless the user has flipped the master switch on.
  // Cheap (~one map walk every 5 minutes), so no harm in always running.
  import('./lib/notify').then((m) => m.startNotificationLoop()).catch(() => {});

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

bootstrap();
