/**
 * iCloud Drive sync transport (Tier 12 #7).
 *
 * macOS exposes iCloud Drive as a regular folder at:
 *   ~/Library/Mobile Documents/com~apple~CloudDocs/
 *
 * If we drop an encrypted snapshot in there, iCloud Drive auto-syncs
 * it across the user's Mac, iPad, and iPhone. We don't need to talk
 * to CloudKit, OAuth, or any Apple-specific API — it's just a file
 * write.
 *
 * Architecture:
 *
 *   1. The user picks a folder (or accepts the default
 *      `Monii/` subfolder under iCloud Drive) via a Tauri dialog.
 *      We persist the chosen path in `Settings.icloudFolderPath`.
 *
 *   2. On every Yjs update event we debounce 5s, then encrypt the
 *      full state-as-update via the same `encryptBytes` we use for
 *      Drive sync, and write it to `<folder>/snapshot.bin`.
 *
 *   3. On a 30-second poll (or focus event), we re-read the file,
 *      decrypt, and apply the update via `Y.applyUpdate`. iCloud
 *      handles delivery between devices — when the file changes on
 *      one device, the local copy on another device updates too.
 *
 * Browser PWAs don't have filesystem access — this provider is a
 * no-op outside of Tauri. Settings UI hides itself accordingly.
 *
 * **Browser PWAs and File System Access fallback**: Chrome/Edge
 * desktop browsers expose the FSA API which would let us pick a
 * folder + write to it. We don't ship that path here because the
 * primary use case (multi-device sync via iCloud) requires the
 * macOS Tauri shell, where iCloud Drive auto-propagates the file.
 */

import * as Y from 'yjs';
import { getDoc } from './doc';
import { getSettings, setSettingsField } from '../db/repo';
import { encryptBytes, decryptBytes } from './crypto';

const SNAPSHOT_FILENAME = 'monii-watch-snapshot.bin';
const POLL_INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 5_000;

let pushTimer: number | null = null;
let pollHandle: number | null = null;
let yjsObserver: ((update: Uint8Array, origin: unknown) => void) | null = null;
const ORIGIN_REMOTE_PULL = Symbol('icloud-pull');

/**
 * Last error we hit during a push or pull. Surfaced to the Settings
 * UI so the user can see WHY sync isn't working — silent failures
 * are the worst. Subscribers get notified on every change.
 */
type SyncErrorState = { message: string; at: number; phase: 'push' | 'pull' | 'verify' } | null;
let lastError: SyncErrorState = null;
const errorListeners = new Set<(e: SyncErrorState) => void>();

function setError(e: SyncErrorState): void {
  lastError = e;
  for (const l of errorListeners) l(e);
}

export function getLastSyncError(): SyncErrorState {
  return lastError;
}

export function onSyncError(listener: (e: SyncErrorState) => void): () => void {
  errorListeners.add(listener);
  // Fire immediately with current state so subscribers don't have
  // to call getLastSyncError separately.
  listener(lastError);
  return () => errorListeners.delete(listener);
}

/**
 * Whether the current runtime can actually use this transport. False
 * in PWAs (no filesystem); true in the Tauri desktop shell.
 */
export function isAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
}

/**
 * Detect the most likely "this folder is auto-synced by a cloud
 * service" path based on the user's OS. Pure best-guess — used to
 * pre-fill the folder picker so most users only need to click OK.
 *
 *   - macOS: iCloud Drive at the standard system path
 *   - Windows: OneDrive (most common preinstalled), then Dropbox
 *   - Linux: Dropbox / Nextcloud / etc. — no reliable default
 *
 * Doesn't verify the folder exists; the picker handles that.
 */
async function suggestDefaultFolder(): Promise<string> {
  const path = await import('@tauri-apps/api/path');
  const home = await path.homeDir();
  // Strip trailing separator if any.
  const h = home.replace(/[\\/]+$/, '');
  const isWindows = navigator.userAgent.includes('Windows');
  const isMac = /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
  if (isMac) {
    return `${h}/Library/Mobile Documents/com~apple~CloudDocs/Monii`;
  }
  if (isWindows) {
    // OneDrive lives at %USERPROFILE%\OneDrive on the vast majority
    // of Windows installs. Personal account uses `OneDrive`,
    // work/school uses `OneDrive - <Company>`. We suggest the
    // personal one; the user can navigate to the right folder via
    // the picker if they want OneDrive Business or a different
    // service entirely.
    return `${h}\\OneDrive\\Monii`;
  }
  // Linux: no canonical cloud-folder default. Suggest the home dir.
  return `${h}/Monii`;
}

/**
 * Pick (or remember) the cloud-synced folder to use. macOS defaults
 * to iCloud Drive's standard path; Windows defaults to OneDrive's
 * standard path. The user can pick any folder a cloud service syncs
 * — Dropbox, Nextcloud, Google Drive (via the Drive for desktop
 * app, which mounts as a regular folder), etc.
 *
 * Returns the chosen path, or null if the user cancelled.
 */
export async function pickFolder(): Promise<string | null> {
  if (!isAvailable()) return null;
  const dialog = await import('@tauri-apps/plugin-dialog');
  const defaultPath = await suggestDefaultFolder();
  const result = await dialog.open({
    directory: true,
    multiple: false,
    title: 'Pick a cloud-synced folder for encrypted backups',
    defaultPath,
  });
  if (!result || typeof result !== 'string') return null;
  return result;
}

/** Exported for the Settings UI to display the suggested default path. */
export async function getSuggestedFolder(): Promise<string> {
  return suggestDefaultFolder();
}

/**
 * Ensure the chosen folder exists (creates it if missing).
 */
async function ensureFolder(folderPath: string): Promise<void> {
  const fs = await import('@tauri-apps/plugin-fs');
  try {
    const exists = await fs.exists(folderPath);
    if (!exists) {
      await fs.mkdir(folderPath, { recursive: true });
    }
  } catch (err) {
    console.warn('[icloud] could not create folder', err);
  }
}

/**
 * Push the current Yjs state to disk (encrypted). Sets `lastError`
 * on failure so the Settings UI can surface a message instead of
 * silently dropping the sync.
 */
async function pushNow(folderPath: string, passphrase: string): Promise<void> {
  if (!isAvailable() || !passphrase) return;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    await ensureFolder(folderPath);
    const update = Y.encodeStateAsUpdate(getDoc());
    const cipher = await encryptBytes(update, passphrase);
    // Write as binary via the typed-array API.
    await fs.writeFile(`${folderPath}/${SNAPSHOT_FILENAME}`, cipher);
    setSettingsField('icloudLastSyncedAt', Date.now());
    // Clear any previously surfaced error since this push succeeded.
    if (lastError) setError(null);
  } catch (err) {
    setError({
      message: (err as Error)?.message ?? String(err),
      at: Date.now(),
      phase: 'push',
    });
  }
}

/**
 * Pull the snapshot from disk and merge into the local Yjs doc.
 * No-op when the file doesn't exist yet (first push from another
 * device hasn't happened).
 */
async function pullNow(folderPath: string, passphrase: string): Promise<void> {
  if (!isAvailable() || !passphrase) return;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const file = `${folderPath}/${SNAPSHOT_FILENAME}`;
    const exists = await fs.exists(file);
    if (!exists) return;
    const cipher = await fs.readFile(file);
    const update = await decryptBytes(cipher, passphrase);
    // Tag the merge with our origin symbol so the push observer
    // doesn't bounce it back to disk.
    getDoc().transact(() => {
      Y.applyUpdate(getDoc(), update, ORIGIN_REMOTE_PULL);
    }, ORIGIN_REMOTE_PULL);
    setSettingsField('icloudLastSyncedAt', Date.now());
    if (lastError) setError(null);
  } catch (err) {
    setError({
      message: (err as Error)?.message ?? String(err),
      at: Date.now(),
      phase: 'pull',
    });
  }
}

/**
 * Start the iCloud sync loop:
 *   - pull on boot
 *   - debounced push on every Yjs update
 *   - poll pull every 30s for changes from other devices
 */
export async function startICloudSync(): Promise<void> {
  if (!isAvailable()) return;
  const settings = getSettings();
  if (!settings.icloudEnabled) return;
  const folder = settings.icloudFolderPath;
  const pass = settings.syncRoom; // re-use the pairing phrase as the encryption key
  if (!folder || !pass) return;

  // Initial pull
  await pullNow(folder, pass);

  // Push observer
  if (!yjsObserver) {
    yjsObserver = (_update, origin) => {
      // Don't bounce a remote-pull back to disk.
      if (origin === ORIGIN_REMOTE_PULL) return;
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => {
        void pushNow(folder, pass);
      }, DEBOUNCE_MS);
    };
    getDoc().on('update', yjsObserver);
  }

  // Poll
  if (pollHandle === null) {
    pollHandle = window.setInterval(() => {
      void pullNow(folder, pass);
    }, POLL_INTERVAL_MS);
  }
}

export function stopICloudSync(): void {
  if (yjsObserver) {
    getDoc().off('update', yjsObserver);
    yjsObserver = null;
  }
  if (pushTimer !== null) {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pollHandle !== null) {
    window.clearInterval(pollHandle);
    pollHandle = null;
  }
}

/** Force a push on demand (Settings → "Sync now" button). */
export async function forcePush(): Promise<void> {
  if (!isAvailable()) return;
  const settings = getSettings();
  if (!settings.icloudFolderPath || !settings.syncRoom) return;
  await pushNow(settings.icloudFolderPath, settings.syncRoom);
}

/** Force a pull on demand. */
export async function forcePull(): Promise<void> {
  if (!isAvailable()) return;
  const settings = getSettings();
  if (!settings.icloudFolderPath || !settings.syncRoom) return;
  await pullNow(settings.icloudFolderPath, settings.syncRoom);
}

/**
 * Pre-flight check: confirm the chosen folder is reachable AND
 * writable. Done before flipping `icloudEnabled` on so the user gets
 * a clear error instead of silent failures later. Also returns the
 * existing snapshot's size if one is already there — useful for the
 * Settings UI to show "found existing X KB snapshot" before enabling.
 */
export type FolderProbeResult = {
  ok: boolean;
  /** Human-readable error if `ok` is false. */
  error?: string;
  /** Size in bytes of an existing snapshot, if one was found. */
  existingSnapshotBytes?: number;
};

export async function probeFolder(folderPath: string): Promise<FolderProbeResult> {
  if (!isAvailable()) {
    return { ok: false, error: 'Cloud folder sync requires the desktop app.' };
  }
  if (!folderPath.trim()) {
    return { ok: false, error: 'Pick a folder first.' };
  }
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    // Try to create the folder if missing — that's normal for a
    // first-time setup where the user picks a path that doesn't yet
    // exist (e.g. iCloud Drive/Monii). Failures here mean the path
    // is on a non-writable volume or permission was denied.
    if (!(await fs.exists(folderPath))) {
      try {
        await fs.mkdir(folderPath, { recursive: true });
      } catch (err) {
        return {
          ok: false,
          error: `Couldn't create the folder: ${(err as Error)?.message ?? String(err)}`,
        };
      }
    }
    // Round-trip a marker file to confirm the volume is writable.
    const marker = `${folderPath}/.monii-write-test`;
    try {
      await fs.writeTextFile(marker, 'monii-watch-test');
      await fs.remove(marker);
    } catch (err) {
      return {
        ok: false,
        error: `Folder isn't writable: ${(err as Error)?.message ?? String(err)}`,
      };
    }
    // If a snapshot already exists, peek at its size.
    let existingSnapshotBytes: number | undefined;
    const file = `${folderPath}/${SNAPSHOT_FILENAME}`;
    if (await fs.exists(file)) {
      try {
        const buf = await fs.readFile(file);
        existingSnapshotBytes = buf.byteLength;
      } catch { /* size is informational; ignore */ }
    }
    return { ok: true, existingSnapshotBytes };
  } catch (err) {
    return {
      ok: false,
      error: `Folder probe failed: ${(err as Error)?.message ?? String(err)}`,
    };
  }
}

/**
 * Move the encrypted snapshot from the previously-configured folder
 * to a new one. Used when the user changes the sync folder
 * post-setup so the new location is immediately current — no waiting
 * for the next push to repopulate.
 *
 * If the source folder doesn't have a snapshot, this is a no-op
 * (the next push will create one in the new location). If the move
 * fails partway through, we leave both copies in place rather than
 * lose data.
 */
export async function moveSnapshot(fromPath: string, toPath: string): Promise<{ moved: boolean; reason?: string }> {
  if (!isAvailable()) return { moved: false, reason: 'desktop-only' };
  if (!fromPath || !toPath || fromPath === toPath) return { moved: false, reason: 'no-op' };
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const src = `${fromPath}/${SNAPSHOT_FILENAME}`;
    const dst = `${toPath}/${SNAPSHOT_FILENAME}`;
    if (!(await fs.exists(src))) {
      return { moved: false, reason: 'no source snapshot' };
    }
    if (!(await fs.exists(toPath))) {
      await fs.mkdir(toPath, { recursive: true });
    }
    // Read → write → delete. Doing it as copy-then-delete (rather
    // than rename) keeps the atomicity guarantee even when source
    // and destination are on different volumes (iCloud → OneDrive).
    const data = await fs.readFile(src);
    await fs.writeFile(dst, data);
    // Verify the destination got the same bytes before removing the source.
    const verify = await fs.readFile(dst);
    if (verify.byteLength !== data.byteLength) {
      return { moved: false, reason: 'verify mismatch — source kept' };
    }
    await fs.remove(src);
    return { moved: true };
  } catch (err) {
    return {
      moved: false,
      reason: `move failed: ${(err as Error)?.message ?? String(err)}`,
    };
  }
}

/**
 * Remove the encrypted snapshot from the cloud folder. Called by
 * the "Disable + remove cloud copy" flow when the user wants a
 * clean uninstall (e.g. they're switching transports or no longer
 * want any encrypted blob in their cloud account).
 */
export async function removeCloudSnapshot(folderPath: string): Promise<void> {
  if (!isAvailable() || !folderPath) return;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const file = `${folderPath}/${SNAPSHOT_FILENAME}`;
    if (await fs.exists(file)) {
      await fs.remove(file);
    }
  } catch (err) {
    // Surface as an error so the Settings UI can show "couldn't
    // remove — please delete X manually."
    setError({
      message: `Couldn't remove the cloud copy: ${(err as Error)?.message ?? String(err)}`,
      at: Date.now(),
      phase: 'verify',
    });
  }
}
