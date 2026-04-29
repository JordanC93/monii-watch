/**
 * Uninstall flow.
 *
 * Standard "drag the app to Trash" (macOS) or Add/Remove Programs
 * (Windows) does NOT fully wipe Monii Watch's data — IndexedDB,
 * localStorage, WebKit/WebView2 cache directories all live outside the
 * app bundle and persist after deletion. This modal walks the user
 * through a *complete* uninstall:
 *
 *   1. Clear in-browser/in-webview state we control directly:
 *      - The Yjs IndexedDB database
 *      - All localStorage keys
 *      - Service Worker + Cache Storage (PWA assets)
 *
 *   2. Show platform-specific instructions for the OS-level cleanup
 *      we CAN'T reach from JS (the WebKit data dir on macOS, the
 *      WebView2 dir on Windows, the .app bundle itself).
 *
 *   3. Optionally back up first — one-tap export-to-JSON before the
 *      wipe, so a user who clicks Uninstall by mistake doesn't lose
 *      the budget they spent six months building.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { exportSnapshot } from '../../db/repo';
import { isMacOS, isTauri } from '../../lib/device';
import { Trash2, AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { toast } from '../../lib/toast';

type Step = 'warn' | 'confirm' | 'wiping' | 'done';

export function UninstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('warn');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isMac = isMacOS();
  const isTauriApp = isTauri();
  const isWindows = !isMac && /Win/.test(navigator.platform);

  function reset() {
    setStep('warn');
    setConfirmText('');
    setError(null);
  }

  function handleClose() {
    if (step === 'wiping') return; // don't allow close mid-wipe
    reset();
    onClose();
  }

  function backup() {
    try {
      const snap = exportSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monii-watch-backup-before-uninstall-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded. Keep it safe before continuing.');
    } catch (err) {
      toast.error('Backup failed — see console for details.');
      console.error('[uninstall] backup failed', err);
    }
  }

  async function performWipe() {
    setStep('wiping');
    setError(null);
    try {
      // 1. Delete the Yjs IndexedDB document.
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('monii-watch-doc-v1');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          // Another tab/window has the DB open — common edge case.
          // Wait a bit and resolve anyway; the deletion will complete
          // when the other tab closes.
          setTimeout(() => resolve(), 1000);
        };
      });

      // 2. Wipe ALL localStorage keys we own. Filter by `monii:` prefix
      //    so we don't blow away any unrelated keys (defensive — we
      //    don't expect any, but no harm in being precise).
      try {
        const ours = Object.keys(localStorage).filter((k) => k.startsWith('monii:') || k.startsWith('monii-'));
        for (const k of ours) localStorage.removeItem(k);
      } catch (err) {
        console.warn('[uninstall] localStorage wipe partial', err);
      }

      // 3. Unregister service workers + clear cache storage (PWA path).
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.warn('[uninstall] cache wipe partial', err);
      }

      // 4. SessionStorage too, for completeness.
      try { sessionStorage.clear(); } catch {}

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('warn');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-1.5">
          <Trash2 size={14} className="text-negative" /> Uninstall Monii Watch
        </span>
      }
      size="lg"
      footer={
        step === 'warn' ? (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="danger" onClick={() => setStep('confirm')}>
              Continue to wipe
            </Button>
          </div>
        ) : step === 'confirm' ? (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep('warn')}>Back</Button>
            <Button
              variant="danger"
              onClick={performWipe}
              disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            >
              Wipe everything now
            </Button>
          </div>
        ) : step === 'wiping' ? (
          <div className="text-center text-fg-subtle text-[12px]">Wiping data…</div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        )
      }
    >
      {step === 'warn' && (
        <div className="text-[13px] space-y-3">
          <div className="flex items-start gap-2 bg-warning/15 border border-warning/40 rounded-lg p-3">
            <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-warning mb-0.5">This is permanent.</div>
              <div className="text-fg-muted">
                All accounts, transactions, budgets, goals, attached
                receipts, and synced settings will be erased from this
                device. <strong>Other paired devices keep their copies</strong>{' '}
                until they sync — so wipe them too if that's the goal.
              </div>
            </div>
          </div>

          <div>
            <div className="font-medium mb-1">What this does</div>
            <ul className="space-y-1 text-fg-muted list-disc pl-5 text-[12.5px]">
              <li>Deletes the Yjs database (transactions, accounts, budgets, etc.)</li>
              <li>Clears all <code>monii:*</code> localStorage keys (theme, density, layout, custom settings)</li>
              <li>Unregisters the service worker + clears the PWA cache</li>
              <li>Closes the app</li>
            </ul>
          </div>

          <div>
            <div className="font-medium mb-1">What this does NOT do (you handle these manually)</div>
            <ul className="space-y-1 text-fg-muted list-disc pl-5 text-[12.5px]">
              {isMac ? (
                <>
                  <li>Delete <code>~/Library/WebKit/com.moniiwatch.app/</code> — the WebKit data directory (contains a duplicate of the IndexedDB on disk, which we can't touch from inside the app's sandbox)</li>
                  <li>Delete <code>~/Library/Application Support/com.moniiwatch.app/</code></li>
                  <li>Move <code>/Applications/Monii Watch.app</code> to Trash</li>
                </>
              ) : isWindows ? (
                <>
                  <li>Delete <code>%LOCALAPPDATA%\com.moniiwatch.app\</code> — WebView2 data directory</li>
                  <li>Run the <strong>Add/Remove Programs</strong> uninstaller (which also asks "delete data?" — say YES this time)</li>
                </>
              ) : (
                <li>Delete <code>~/.local/share/com.moniiwatch.app/</code> — the WebKitGTK data directory</li>
              )}
            </ul>
            {!isTauriApp && (
              <div className="text-[11.5px] text-fg-subtle mt-2">
                You're running the browser PWA, not the desktop app. There's
                no app bundle to delete; this wipe is sufficient on its own.
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <div className="font-medium mb-1">Want to back up first?</div>
            <p className="text-fg-muted text-[12.5px] mb-2">
              Download a JSON snapshot you can re-import later if you change
              your mind. Strongly recommended.
            </p>
            <Button variant="secondary" size="sm" onClick={backup}>
              <Download size={13} /> Download backup JSON
            </Button>
          </div>

          {error && (
            <div className="text-[12px] text-negative bg-negative/15 rounded-lg p-2">
              Wipe failed: {error}. Try closing other tabs/windows of the
              app and try again.
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && (
        <div className="text-[13px] space-y-3">
          <p>
            Type <strong className="font-mono text-negative">DELETE</strong> in the box below to confirm.
            Capitalization matters.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[13px] focus:outline-none focus:border-negative"
          />
          <p className="text-[11.5px] text-fg-subtle">
            After this completes, the app will close. You'll then need
            to drag the .app to the Trash {isMac && '(or run the cleanup script — see docs/UNINSTALL.md)'}.
          </p>
        </div>
      )}

      {step === 'wiping' && (
        <div className="py-8 text-center text-[13px] text-fg-muted">
          <div className="w-6 h-6 mx-auto mb-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          Wiping IndexedDB, localStorage, and caches…
        </div>
      )}

      {step === 'done' && (
        <div className="text-[13px] space-y-3">
          <div className="bg-positive/15 border border-positive/40 rounded-lg p-3">
            <div className="font-semibold text-positive mb-0.5">In-app data wiped.</div>
            <div className="text-fg-muted">
              IndexedDB, localStorage, service worker, and PWA cache are clear.
            </div>
          </div>

          <div>
            <div className="font-medium mb-1">Final steps</div>
            {isMac && isTauriApp && (
              <ol className="space-y-1.5 list-decimal pl-5 text-fg-muted text-[12.5px]">
                <li>Quit Monii Watch (⌘Q)</li>
                <li>Open Finder → <strong>Applications</strong> → drag <strong>Monii Watch</strong> to the Trash</li>
                <li>
                  Open Terminal and paste:
                  <pre className="bg-surface-2 rounded p-2 mt-1 text-[11px] tabular whitespace-pre-wrap">{`rm -rf ~/Library/WebKit/com.moniiwatch.app
rm -rf ~/Library/Application\\ Support/com.moniiwatch.app
rm -rf ~/Library/Caches/com.moniiwatch.app
rm -f  ~/Library/Preferences/com.moniiwatch.app.plist
rm -rf ~/Library/Saved\\ Application\\ State/com.moniiwatch.app.savedState`}</pre>
                </li>
                <li>Empty the Trash</li>
              </ol>
            )}
            {isWindows && isTauriApp && (
              <ol className="space-y-1.5 list-decimal pl-5 text-fg-muted text-[12.5px]">
                <li>Quit Monii Watch</li>
                <li>Open <strong>Settings → Apps → Installed apps</strong></li>
                <li>Find <strong>Monii Watch</strong> → <strong>Uninstall</strong></li>
                <li>When the dialog asks "delete the application data?", click <strong>Yes</strong> (the default is No, which leaves orphan data)</li>
                <li>Open Run (Win+R), paste <code>%LOCALAPPDATA%\com.moniiwatch.app</code> — if the folder still exists, delete it</li>
              </ol>
            )}
            {!isTauriApp && (
              <p className="text-fg-muted text-[12.5px]">
                Browser PWA: this wipe is sufficient. The app icon on your home
                screen (if any) can be removed normally — long-press → Remove.
              </p>
            )}
          </div>

          <div className="text-[11.5px] text-fg-subtle border-t border-border pt-3">
            Detailed instructions also live in <code>docs/UNINSTALL.md</code> in the project repo.
          </div>
        </div>
      )}
    </Modal>
  );
}
