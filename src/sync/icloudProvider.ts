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
 * Push the current Yjs state to disk (encrypted).
 */
async function pushNow(folderPath: string, passphrase: string): Promise<void> {
  if (!isAvailable() || !passphrase) return;
  const fs = await import('@tauri-apps/plugin-fs');
  await ensureFolder(folderPath);
  const update = Y.encodeStateAsUpdate(getDoc());
  const cipher = await encryptBytes(update, passphrase);
  // Write as binary via the typed-array API.
  await fs.writeFile(`${folderPath}/${SNAPSHOT_FILENAME}`, cipher);
  setSettingsField('icloudLastSyncedAt', Date.now());
}

/**
 * Pull the snapshot from disk and merge into the local Yjs doc.
 * No-op when the file doesn't exist yet (first push from another
 * device hasn't happened).
 */
async function pullNow(folderPath: string, passphrase: string): Promise<void> {
  if (!isAvailable() || !passphrase) return;
  const fs = await import('@tauri-apps/plugin-fs');
  const file = `${folderPath}/${SNAPSHOT_FILENAME}`;
  try {
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
  } catch (err) {
    console.warn('[icloud] pull failed', err);
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
