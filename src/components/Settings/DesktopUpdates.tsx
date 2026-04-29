/**
 * Desktop "Updates" panel. Slots into the Settings page only when the app
 * is running inside the Tauri desktop shell — in PWA / browser contexts
 * the panel hides itself entirely (auto-update doesn't apply: the browser
 * always loads the latest hosted version, and PWA service-worker updates
 * are handled by the SW lifecycle).
 *
 * Auto-checks once on mount with a 5s delay (so app boot isn't blocked).
 * The user can also click "Check now" to force a check.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { isDesktopApp, checkForUpdate, installUpdate, formatBytes, type UpdateStatus } from '../../lib/desktopUpdater';

export function DesktopUpdates() {
  const [status, setStatus] = useState<UpdateStatus>(isDesktopApp() ? { kind: 'idle' } : { kind: 'web' });
  const checkedOnce = useRef(false);

  // Background check on first mount, debounced 5s after boot.
  useEffect(() => {
    if (!isDesktopApp() || checkedOnce.current) return;
    checkedOnce.current = true;
    const t = setTimeout(() => { void checkForUpdate(setStatus); }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Hide the whole section in browser builds — there's nothing to do.
  if (status.kind === 'web') return null;

  return (
    <div className="space-y-2">
      {status.kind === 'idle' && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-fg-subtle">Click to check the release feed for a newer version.</div>
          <Button variant="secondary" onClick={() => void checkForUpdate(setStatus)}>
            <RefreshCw size={13} /> Check now
          </Button>
        </div>
      )}

      {status.kind === 'checking' && (
        <div className="flex items-center gap-2 text-[13px]">
          <Loader2 size={14} className="text-accent animate-spin" />
          Checking for updates…
        </div>
      )}

      {status.kind === 'up-to-date' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <CheckCircle2 size={14} className="text-positive" />
            You're on the latest version.
          </div>
          <Button variant="secondary" onClick={() => void checkForUpdate(setStatus)}>
            <RefreshCw size={13} /> Check again
          </Button>
        </div>
      )}

      {status.kind === 'available' && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-accent">Version {status.version} is available</div>
              {status.date && <div className="text-[11.5px] text-fg-subtle">Released {status.date}</div>}
            </div>
            <Button variant="primary" onClick={() => void installUpdate(setStatus)}>
              <Download size={13} /> Download &amp; install
            </Button>
          </div>
          {status.notes && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-fg-subtle hover:text-fg">What's new</summary>
              <pre className="mt-1.5 p-2 rounded bg-surface-3 text-fg-muted text-[11.5px] whitespace-pre-wrap max-h-40 overflow-y-auto">{status.notes}</pre>
            </details>
          )}
        </div>
      )}

      {status.kind === 'downloading' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[13px]">
            <Loader2 size={14} className="text-accent animate-spin" />
            Downloading update…
          </div>
          <div className="h-1.5 bg-surface-3 rounded overflow-hidden">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: status.total ? `${Math.min(100, (status.downloaded / status.total) * 100)}%` : '40%' }}
            />
          </div>
          <div className="text-[11px] text-fg-subtle tabular">
            {formatBytes(status.downloaded)}{status.total ? ` / ${formatBytes(status.total)}` : ''}
          </div>
        </div>
      )}

      {status.kind === 'installing' && (
        <div className="flex items-center gap-2 text-[13px]">
          <Loader2 size={14} className="text-accent animate-spin" />
          Installing… the app will restart in a moment.
        </div>
      )}

      {status.kind === 'restart-required' && (
        <div className="flex items-center gap-2 text-[13px] text-positive">
          <CheckCircle2 size={14} /> Update installed. Restarting…
        </div>
      )}

      {status.kind === 'error' && (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 text-[12.5px] text-negative">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Update check failed</div>
              <div className="text-fg-muted">{status.message}</div>
              <div className="text-[11px] text-fg-subtle mt-1">
                If this build wasn't shipped with an updater key configured, that's expected — auto-update isn't available for this install. Re-download the latest installer from the releases page.
              </div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => void checkForUpdate(setStatus)}>
            <RefreshCw size={13} /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}
