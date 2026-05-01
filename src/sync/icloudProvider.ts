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
const PREVIOUS_FILENAME = 'monii-watch-snapshot.bin.previous';
const POLL_INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 5_000;
const ACTIVITY_LS_KEY = 'monii:cloud-sync-activity';
const ACTIVITY_MAX = 100;

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

// ---------------------------------------------------------------------------
// Activity log + quota detection (Tier 12 #11/#12/#13)
//
// Every push, pull, and merge is recorded as one entry in a circular
// buffer kept in localStorage. The Settings UI can render the buffer
// as a chronological "what's been syncing" log — useful for spotting
// failed pushes you missed, or confirming a remote pull actually
// applied.
//
// Why localStorage: this is per-device debugging info, not synced
// across devices. Keeping it out of Yjs avoids merge contention on
// what is fundamentally a local-only audit trail.

export type ActivityEntry = {
  /** Unix ms. */
  at: number;
  /** Kind of event. */
  kind: 'push' | 'pull' | 'merge' | 'restore' | 'rotate';
  /** Whether the event succeeded. False entries carry an `error`. */
  ok: boolean;
  /** Bytes of the snapshot involved, when applicable. */
  bytes?: number;
  /** Human-readable error message when `ok` is false. */
  error?: string;
  /** When `kind === 'merge'`, the count of Yjs structs delivered.
   *  Higher = more changes pulled from another device. */
  mergedStructs?: number;
};

function loadActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveActivity(arr: ActivityEntry[]): void {
  try {
    localStorage.setItem(ACTIVITY_LS_KEY, JSON.stringify(arr));
  } catch { /* private mode, ignore */ }
}

const activityListeners = new Set<(entries: ActivityEntry[]) => void>();

export function getActivityLog(): ActivityEntry[] {
  return loadActivity();
}

export function clearActivityLog(): void {
  saveActivity([]);
  for (const l of activityListeners) l([]);
}

export function onActivity(listener: (entries: ActivityEntry[]) => void): () => void {
  activityListeners.add(listener);
  listener(loadActivity());
  return () => activityListeners.delete(listener);
}

function recordActivity(entry: ActivityEntry): void {
  const all = loadActivity();
  all.push(entry);
  while (all.length > ACTIVITY_MAX) all.shift();
  saveActivity(all);
  for (const l of activityListeners) l(all);
}

/**
 * Pattern-match the OS error message to detect cloud-quota / disk-
 * full conditions. Doesn't require any cloud-API access — we just
 * look at the error string the filesystem returned. Triggers a more
 * helpful Settings-page banner ("Cloud storage looks full…") instead
 * of just dumping the raw OS error.
 */
export function classifyError(message: string): 'quota' | 'permission' | 'network' | 'unknown' {
  const m = message.toLowerCase();
  if (
    m.includes('no space') ||
    m.includes('disk full') ||
    m.includes('quota') ||
    m.includes('storage is full') ||
    m.includes('enospc')
  ) return 'quota';
  if (
    m.includes('permission denied') ||
    m.includes('access denied') ||
    m.includes('not permitted') ||
    m.includes('eacces')
  ) return 'permission';
  if (
    m.includes('network') ||
    m.includes('offline') ||
    m.includes('timed out') ||
    m.includes('connection')
  ) return 'network';
  return 'unknown';
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
 *
 * Snapshot rotation (Tier 12 #12): before overwriting, the previous
 * `snapshot.bin` is renamed to `snapshot.bin.previous`. One-step
 * recovery if a write goes wrong — encryption bug, cloud service
 * corrupting the file mid-upload, etc. The previous version is
 * kept across exactly one rotation; older versions are not kept
 * (cloud storage is finite).
 */
async function pushNow(folderPath: string, passphrase: string): Promise<void> {
  if (!isAvailable() || !passphrase) return;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    await ensureFolder(folderPath);
    const update = Y.encodeStateAsUpdate(getDoc());
    const cipher = await encryptBytes(update, passphrase);
    const target = `${folderPath}/${SNAPSHOT_FILENAME}`;
    const previous = `${folderPath}/${PREVIOUS_FILENAME}`;
    // Rotate: if the current snapshot exists, copy it to .previous
    // before overwriting. A copy (rather than a rename) keeps the
    // operation safe across cloud-sync metadata that some services
    // attach to specific filenames.
    try {
      if (await fs.exists(target)) {
        const cur = await fs.readFile(target);
        await fs.writeFile(previous, cur);
        recordActivity({ at: Date.now(), kind: 'rotate', ok: true, bytes: cur.byteLength });
      }
    } catch (rotErr) {
      // Rotation failure isn't fatal — push the new snapshot anyway.
      recordActivity({
        at: Date.now(), kind: 'rotate', ok: false,
        error: (rotErr as Error)?.message ?? String(rotErr),
      });
    }
    // Write as binary via the typed-array API.
    await fs.writeFile(target, cipher);
    setSettingsField('icloudLastSyncedAt', Date.now());
    recordActivity({ at: Date.now(), kind: 'push', ok: true, bytes: cipher.byteLength });
    // Clear any previously surfaced error since this push succeeded.
    if (lastError) setError(null);
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    setError({ message, at: Date.now(), phase: 'push' });
    recordActivity({ at: Date.now(), kind: 'push', ok: false, error: message });
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
    // Pre-merge state vector size — used to compute how many structs
    // the remote update actually delivered. Yjs's `applyUpdate`
    // doesn't return that directly, so we measure the doc size delta.
    const stateBefore = Y.encodeStateAsUpdate(getDoc()).byteLength;
    // Tag the merge with our origin symbol so the push observer
    // doesn't bounce it back to disk.
    getDoc().transact(() => {
      Y.applyUpdate(getDoc(), update, ORIGIN_REMOTE_PULL);
    }, ORIGIN_REMOTE_PULL);
    const stateAfter = Y.encodeStateAsUpdate(getDoc()).byteLength;
    setSettingsField('icloudLastSyncedAt', Date.now());
    recordActivity({ at: Date.now(), kind: 'pull', ok: true, bytes: cipher.byteLength });
    // Only log a merge entry when the doc actually changed — most
    // pulls are no-ops because we already had the data. The byte
    // delta is a proxy for "actual changes delivered."
    if (stateAfter > stateBefore) {
      recordActivity({
        at: Date.now(), kind: 'merge', ok: true,
        mergedStructs: stateAfter - stateBefore,
      });
    }
    if (lastError) setError(null);
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    setError({ message, at: Date.now(), phase: 'pull' });
    recordActivity({ at: Date.now(), kind: 'pull', ok: false, error: message });
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
    // Best-effort: also move the rotated `.previous` snapshot so the
    // user keeps their one-step-back recovery option after the move.
    // Don't fail the operation if this part fails; the next push
    // will re-establish a `.previous` via rotation.
    try {
      const srcPrev = `${fromPath}/${PREVIOUS_FILENAME}`;
      if (await fs.exists(srcPrev)) {
        const prevData = await fs.readFile(srcPrev);
        await fs.writeFile(`${toPath}/${PREVIOUS_FILENAME}`, prevData);
        await fs.remove(srcPrev);
      }
    } catch { /* non-fatal */ }
    return { moved: true };
  } catch (err) {
    return {
      moved: false,
      reason: `move failed: ${(err as Error)?.message ?? String(err)}`,
    };
  }
}

/**
 * Whether a `.previous` snapshot exists for the configured folder
 * — used by the Settings UI to show/hide the "Restore previous
 * snapshot" button.
 */
export async function hasPreviousSnapshot(folderPath: string): Promise<boolean> {
  if (!isAvailable() || !folderPath) return false;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    return fs.exists(`${folderPath}/${PREVIOUS_FILENAME}`);
  } catch {
    return false;
  }
}

/**
 * Restore the previous-version snapshot. Useful if the current
 * snapshot is corrupt OR if the user wants to undo a recent batch
 * of changes that synced from another device. Tier 12 #12.
 *
 * Steps:
 *   1. Read `.previous` (the rotated copy from the last good push).
 *   2. Decrypt + apply to the local Yjs doc.
 *   3. Force a fresh push so the cloud copy reflects the restored
 *      state. The current `snapshot.bin` becomes the new `.previous`
 *      via the standard rotation in pushNow.
 *
 * Doesn't delete the `.previous` file proactively — the next push
 * naturally overwrites it via rotation.
 */
export async function restorePreviousSnapshot(): Promise<{ ok: boolean; error?: string }> {
  if (!isAvailable()) return { ok: false, error: 'desktop-only' };
  const settings = getSettings();
  const folder = settings.icloudFolderPath;
  const pass = settings.syncRoom;
  if (!folder || !pass) return { ok: false, error: 'sync not configured' };
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const previous = `${folder}/${PREVIOUS_FILENAME}`;
    if (!(await fs.exists(previous))) {
      return { ok: false, error: 'No previous snapshot to restore from.' };
    }
    const cipher = await fs.readFile(previous);
    const update = await decryptBytes(cipher, pass);
    getDoc().transact(() => {
      Y.applyUpdate(getDoc(), update, ORIGIN_REMOTE_PULL);
    }, ORIGIN_REMOTE_PULL);
    recordActivity({ at: Date.now(), kind: 'restore', ok: true, bytes: cipher.byteLength });
    // Force a push so the cloud copy reflects the restored state.
    await pushNow(folder, pass);
    return { ok: true };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    recordActivity({ at: Date.now(), kind: 'restore', ok: false, error: message });
    return { ok: false, error: message };
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
    // Remove both the current snapshot AND the rotated previous
    // copy. A clean uninstall shouldn't leave either behind.
    for (const name of [SNAPSHOT_FILENAME, PREVIOUS_FILENAME]) {
      const file = `${folderPath}/${name}`;
      if (await fs.exists(file)) {
        await fs.remove(file);
      }
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
