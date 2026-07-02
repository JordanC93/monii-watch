/**
 * Optional Google Drive sync transport.
 *
 * Modular and **opt-in**: this file is dynamically imported only when the
 * user enables Drive sync, so the OAuth + crypto + REST code never enters
 * the main bundle for users who don't use it.
 *
 * Design:
 *
 *   1. OAuth 2.0 implicit grant (`response_type=token`) with the
 *      `drive.file` scope. `drive.file` is the most-restrictive Drive
 *      scope — the app can only see files it created, never the user's
 *      other Drive content.
 *
 *      Why implicit grant: it works in the browser AND in Tauri's
 *      WKWebView with a single popup. Refresh tokens require a backend
 *      we don't have. The access token expires in ~1 hour; we silently
 *      re-prompt when it does.
 *
 *      The OAuth client ID is the user's own — they create a free
 *      Google Cloud project, get a client ID, paste it into the app.
 *      We document the steps in `docs/GOOGLE_DRIVE.md`.
 *
 *   2. The Yjs document is encoded with `Y.encodeStateAsUpdate(doc)`
 *      and **encrypted** with `encryptBytes()` (AES-GCM, key derived
 *      from the pairing phrase via PBKDF2 — see `crypto.ts`). The
 *      result is uploaded in a Drive folder called
 *      `Monii Watch (E2E encrypted)`. The filename is scoped to the
 *      active local workspace (`monii-watch-snapshot.bin` for the
 *      default workspace, `monii-watch-snapshot-<id>.bin` otherwise)
 *      so two workspaces never overwrite each other's snapshot — see
 *      `snapshotFilename()`.
 *
 *      Google holds the bytes; Google can't read the contents.
 *
 *   3. On boot: download → decrypt → `Y.applyUpdate()`. Conflicts merge
 *      cleanly (Yjs is a CRDT).
 *
 *   4. On change: debounce 5 s after the last Yjs `update` event, then
 *      re-encrypt + re-upload the full snapshot.
 *
 *   5. On a polling cadence (60 s): re-fetch and merge. Catches changes
 *      from other devices that aren't online together.
 */

import { getDoc } from './doc';
import { getSettings, setSettingsField } from '../db/repo';
import { encryptBytes, decryptBytes } from './crypto';
import { setLastSyncedAt } from './syncMeta';
import { getActiveWorkspaceId } from '../lib/workspaces';
import * as Y from 'yjs';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const LEGACY_SNAPSHOT_FILENAME = 'monii-watch-snapshot.bin';
const FOLDER_NAME = 'Monii Watch (E2E encrypted)';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const POLL_INTERVAL_MS = 60_000;
const PUSH_DEBOUNCE_MS = 5_000;

export type DriveStatus =
  | { kind: 'idle' }
  | { kind: 'authorizing' }
  | { kind: 'syncing'; direction: 'pull' | 'push' }
  | { kind: 'connected' }
  | { kind: 'token-expired' }
  | { kind: 'error'; message: string };

type Listener = (s: DriveStatus) => void;

let status: DriveStatus = { kind: 'idle' };
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let docObserver: ((update: Uint8Array, origin: any) => void) | null = null;
const listeners = new Set<Listener>();
/** Tag set on Yjs `transact()` calls that originate from a remote pull —
 *  prevents the push observer from immediately re-uploading what we
 *  just downloaded. */
const ORIGIN_REMOTE_PULL = Symbol('monii-drive-remote-pull');

export function onDriveStatus(cb: Listener): () => void {
  listeners.add(cb);
  cb(status);
  return () => { listeners.delete(cb); };
}

function setStatus(s: DriveStatus) {
  status = s;
  for (const l of listeners) l(s);
}

export function getDriveStatus(): DriveStatus { return status; }

/**
 * Snapshot filename, scoped to the ACTIVE LOCAL WORKSPACE.
 *
 * Why: the folder + filename used to be fixed constants, so a user who
 * enabled Drive sync in a second workspace silently overwrote the first
 * workspace's snapshot. The first workspace's next pull then failed
 * decryption forever (different pairing phrase). Each workspace must
 * own its own file.
 *
 * The workspace id is read from localStorage (`lib/workspaces.ts`) —
 * device-local by design, NEVER from synced Settings (Iron Rule #22).
 * The app hard-reloads on workspace switch, so this value is stable
 * for the lifetime of the module.
 *
 * Back-compat: the DEFAULT workspace keeps the legacy fixed filename so
 * existing users' Drive snapshots keep working. Non-default workspaces
 * get `monii-watch-snapshot-<workspaceId>.bin`.
 *
 * Note on `googleDriveFileId` caching: that field lives in synced
 * Settings, and Settings live inside the workspace's OWN Yjs doc (each
 * workspace is a separate IndexedDB database). A workspace switch loads
 * a different doc, so workspace A's cached fileId is never visible from
 * workspace B — the per-doc cache is safe as-is.
 */
function snapshotFilename(): string {
  const ws = getActiveWorkspaceId();
  if (ws === 'default') return LEGACY_SNAPSHOT_FILENAME;
  // Workspace ids are slugs ([a-z0-9-]) already; sanitize defensively so
  // the name is safe inside the Drive query's single-quoted string.
  const safe = ws.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48);
  if (!safe) return LEGACY_SNAPSHOT_FILENAME;
  return `monii-watch-snapshot-${safe}.bin`;
}

// -- OAuth ---------------------------------------------------------------

/**
 * Pop up the Google OAuth screen. Resolves with the access token and
 * its expiry timestamp. The popup auto-closes when Google redirects
 * back to our `redirect_uri` with the token in the URL hash.
 *
 * `redirect_uri` MUST be registered as an "Authorized redirect URI" on
 * the user's Google Cloud OAuth client. We use the page's own origin
 * (e.g. `https://monii.example.com`) as the redirect; the user
 * registers exactly one URI per origin they install on.
 */
export async function authorize(clientId: string): Promise<{ token: string; expiresAt: number }> {
  if (!clientId) throw new Error('Google client ID not configured.');
  setStatus({ kind: 'authorizing' });

  // Where Google sends the user back. Must be exact-matched in the
  // OAuth client configuration. We use the current page's origin + path
  // so a single OAuth client works for both PWA and self-hosted installs
  // (each origin is configured separately by the user).
  const redirectUri = window.location.origin + window.location.pathname;
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  // Open in a popup so we don't lose app state on redirect.
  const popup = window.open(url.toString(), 'monii-google-oauth', 'width=520,height=640');
  if (!popup) throw new Error('Popup blocked. Allow popups for this site and try again.');

  return new Promise<{ token: string; expiresAt: number }>((resolve, reject) => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (!ev.data || ev.data.type !== 'monii-oauth-result') return;
      window.removeEventListener('message', onMessage);
      try { popup.close(); } catch {}
      if (ev.data.error) {
        setStatus({ kind: 'error', message: String(ev.data.error) });
        reject(new Error(ev.data.error));
        return;
      }
      if (ev.data.state !== state) {
        setStatus({ kind: 'error', message: 'OAuth state mismatch (possible CSRF — discarded).' });
        reject(new Error('state mismatch'));
        return;
      }
      const expiresIn = parseInt(ev.data.expiresIn, 10) || 3600;
      const expiresAt = Date.now() + (expiresIn - 60) * 1000;
      resolve({ token: ev.data.token, expiresAt });
    };
    window.addEventListener('message', onMessage);

    // If the user closes the popup without granting, time out cleanly.
    const watch = setInterval(() => {
      if (popup.closed) {
        clearInterval(watch);
        window.removeEventListener('message', onMessage);
        setStatus({ kind: 'idle' });
        reject(new Error('Popup closed before authorization completed.'));
      }
    }, 500);
  });
}

/**
 * Run from the OAuth redirect URL: the popup window opens *us* (the same
 * page) with the token in `window.location.hash`. This handler reads it,
 * `postMessage`s it back to the opener, and closes. Wire from `main.tsx`
 * very early — before React renders.
 */
export function handleOAuthCallbackIfPresent(): boolean {
  if (!window.location.hash || !window.opener) return false;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get('access_token');
  if (!token) return false;
  const expiresIn = hash.get('expires_in') ?? '3600';
  const state = hash.get('state') ?? '';
  const error = hash.get('error');
  try {
    window.opener.postMessage(
      { type: 'monii-oauth-result', token, expiresIn, state, error },
      window.location.origin,
    );
  } catch {
    // ignore postMessage failures
  }
  // Best-effort close. If the browser blocks it, the user just sees a
  // blank page they can dismiss; the main window already has the token.
  try { window.close(); } catch {}
  return true;
}

/** Drop the token from settings; the user has to re-authorize. */
export function signOut() {
  setSettingsField('googleAccessToken', '');
  setSettingsField('googleAccessTokenExpiresAt', 0);
  setSettingsField('googleDriveFileId', '');
  setStatus({ kind: 'idle' });
}

// -- Drive REST helpers --------------------------------------------------

async function driveFetch(path: string, init: RequestInit = {}, token: string): Promise<Response> {
  const r = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Drive API ${r.status}: ${text || r.statusText}`);
  }
  return r;
}

async function ensureFolder(token: string): Promise<string> {
  // Look for an existing folder we created.
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const r = await driveFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`,
    {},
    token,
  );
  const data = await r.json();
  if (data.files && data.files.length > 0) return data.files[0].id as string;
  // Create.
  const create = await driveFetch(
    `${DRIVE_API}/files`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    },
    token,
  );
  const folder = await create.json();
  return folder.id as string;
}

async function findSnapshotFile(token: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${snapshotFilename()}' and '${folderId}' in parents and trashed=false`,
  );
  const r = await driveFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`,
    {},
    token,
  );
  const data = await r.json();
  return data.files?.[0]?.id ?? null;
}

async function downloadSnapshot(token: string, fileId: string): Promise<Uint8Array> {
  const r = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, {}, token);
  return new Uint8Array(await r.arrayBuffer());
}

async function uploadSnapshot(
  token: string,
  folderId: string,
  fileId: string | null,
  bytes: Uint8Array,
): Promise<string> {
  // Multipart upload: metadata + media in one request. Per Google's
  // multipart upload spec — boundary delimits the two parts.
  const boundary = 'monii-' + Math.random().toString(36).slice(2);
  const meta: Record<string, any> = { name: snapshotFilename() };
  if (!fileId) meta.parents = [folderId];

  const body = buildMultipart(boundary, JSON.stringify(meta), bytes);
  const url = fileId
    ? `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;
  // Wrap in Blob so the body type satisfies the strict BodyInit on
  // TS 5.7+. Same bytes on the wire — fetch internally treats both the
  // Blob and the raw Uint8Array identically for a binary upload.
  const r = await driveFetch(
    url,
    {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: new Blob([body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer], {
        type: `multipart/related; boundary=${boundary}`,
      }),
    },
    token,
  );
  const data = await r.json();
  return data.id as string;
}

function buildMultipart(boundary: string, metaJson: string, bytes: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metaJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const out = new Uint8Array(head.length + bytes.length + tail.length);
  out.set(head, 0);
  out.set(bytes, head.length);
  out.set(tail, head.length + bytes.length);
  return out;
}

// -- Sync orchestration --------------------------------------------------

/** Pull the latest Drive snapshot (if any) and apply to the local doc. */
async function pull(token: string): Promise<void> {
  setStatus({ kind: 'syncing', direction: 'pull' });
  const folderId = await ensureFolder(token);
  let fileId = getSettings().googleDriveFileId;
  if (!fileId) {
    fileId = (await findSnapshotFile(token, folderId)) ?? '';
    if (fileId) setSettingsField('googleDriveFileId', fileId);
  }
  if (!fileId) {
    // No remote snapshot yet — first device. Upload our current state
    // so the snapshot exists before the next pull tries to find it.
    await push(token);
    return;
  }
  const blob = await downloadSnapshot(token, fileId);
  const phrase = getSettings().syncRoom;
  const update = await decryptBytes(blob, phrase);
  // Apply with a tagged origin so our own observer skips the rebound.
  Y.transact(getDoc(), () => Y.applyUpdate(getDoc(), update), ORIGIN_REMOTE_PULL);
  // Device-local, NOT settings: writing the timestamp into the synced
  // settings map used to re-trigger the push observer forever (and
  // trigger peers' observers). See syncMeta.ts.
  setLastSyncedAt('drive', Date.now());
  setStatus({ kind: 'connected' });
}

/** Encrypt + upload the current Yjs state. */
async function push(token: string): Promise<void> {
  setStatus({ kind: 'syncing', direction: 'push' });
  const folderId = await ensureFolder(token);
  let fileId = getSettings().googleDriveFileId;
  if (!fileId) {
    fileId = (await findSnapshotFile(token, folderId)) ?? null as any;
  }
  const phrase = getSettings().syncRoom;
  const update = Y.encodeStateAsUpdate(getDoc());
  const blob = await encryptBytes(update, phrase);
  const newFileId = await uploadSnapshot(token, folderId, fileId || null, blob);
  if (newFileId !== fileId) setSettingsField('googleDriveFileId', newFileId);
  // Device-local — a settings write here would re-fire our own push
  // observer and loop forever. See syncMeta.ts.
  setLastSyncedAt('drive', Date.now());
  setStatus({ kind: 'connected' });
}

/** Wrap a sync op with token-expiry handling — on 401, surface to the UI
 *  so the user can re-authorize without losing their settings. */
async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
  const settings = getSettings();
  const token = settings.googleAccessToken;
  const exp = settings.googleAccessTokenExpiresAt;
  if (!token || (exp && exp < Date.now())) {
    setStatus({ kind: 'token-expired' });
    return null;
  }
  try {
    return await fn(token);
  } catch (err: any) {
    if (err?.message === 'TOKEN_EXPIRED') {
      setSettingsField('googleAccessToken', '');
      setStatus({ kind: 'token-expired' });
      return null;
    }
    setStatus({ kind: 'error', message: err?.message ?? String(err) });
    console.warn('[drive] sync error', err);
    return null;
  }
}

/** Bootstrap: pull once, then start the push observer + poll loop. */
export async function startDriveSync(): Promise<void> {
  await withToken(pull);
  // Start watching for local changes — debounced upload after each.
  if (!docObserver) {
    docObserver = (_update: Uint8Array, origin: any) => {
      if (origin === ORIGIN_REMOTE_PULL) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { void withToken(push); }, PUSH_DEBOUNCE_MS);
    };
    getDoc().on('update', docObserver);
  }
  // Poll for remote changes.
  if (!pollTimer) {
    pollTimer = setInterval(() => { void withToken(pull); }, POLL_INTERVAL_MS);
  }
}

export function stopDriveSync(): void {
  if (docObserver) {
    getDoc().off('update', docObserver);
    docObserver = null;
  }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setStatus({ kind: 'idle' });
}

/** Force an immediate push (UI "Sync now" button). */
export async function forcePush(): Promise<void> { await withToken(push); }

/** Force an immediate pull (UI "Sync now" button). */
export async function forcePull(): Promise<void> { await withToken(pull); }
