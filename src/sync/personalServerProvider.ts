/**
 * Personal-server backup transport (Tier 14, v0.7.5).
 *
 * A peer of `driveProvider.ts`, but pointed at a user-hosted HTTP
 * endpoint instead of Google Drive. The wire protocol lives in
 * `server/server.js`:
 *
 *   PUT  <url>/backup/<workspace>/snapshot.bin     upload latest
 *   GET  <url>/backup/<workspace>/snapshot.bin     download latest
 *   GET  <url>/backup/<workspace>/snapshots        list versions
 *   GET  <url>/backup/<workspace>/snapshots/<ts>   download a version
 *
 * Auth: optional bearer token in Authorization header. The same
 * server binary that hosts the y-websocket sync hub also hosts the
 * backup endpoint, so the user runs ONE binary on their Plex box /
 * NAS / VPS and gets both transports.
 *
 * Encryption: identical to the Drive provider. The Yjs state is
 * encoded with `Y.encodeStateAsUpdate()`, encrypted via
 * `encryptBytes()` (XChaCha20-Poly1305 + Argon2id, see
 * `sync/crypto.ts`), then uploaded as opaque ciphertext. The server
 * never sees plaintext.
 *
 * Modular and opt-in. Lazy-imported only when the user enables it
 * in Settings, so the fetch + encrypt code never enters the main
 * bundle for users who don't use it.
 */

import { getDoc } from './doc';
import { getSettings, setSettingsField } from '../db/repo';
import { encryptBytes, decryptBytes } from './crypto';
import * as Y from 'yjs';

const POLL_INTERVAL_MS = 60_000;
const PUSH_DEBOUNCE_MS = 5_000;

export type PersonalBackupStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; direction: 'pull' | 'push' }
  | { kind: 'connected' }
  | { kind: 'error'; message: string };

type Listener = (s: PersonalBackupStatus) => void;

let status: PersonalBackupStatus = { kind: 'idle' };
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let docObserver: ((update: Uint8Array, origin: any) => void) | null = null;
const listeners = new Set<Listener>();
const ORIGIN_REMOTE_PULL = Symbol('monii-personal-backup-remote-pull');

export function onPersonalBackupStatus(cb: Listener): () => void {
  listeners.add(cb);
  cb(status);
  return () => { listeners.delete(cb); };
}

function setStatus(s: PersonalBackupStatus) {
  status = s;
  for (const l of listeners) l(s);
}

export function getPersonalBackupStatus(): PersonalBackupStatus {
  return status;
}

// -- HTTP helpers --------------------------------------------------------

function endpointFor(kind: 'snapshot' | 'list'): string | null {
  const s = getSettings();
  let base = s.personalBackupUrl.trim();
  if (!base) return null;
  if (base.endsWith('/')) base = base.slice(0, -1);
  const ws = (s.personalBackupWorkspace || 'default').trim() || 'default';
  if (kind === 'snapshot') return `${base}/backup/${encodeURIComponent(ws)}/snapshot.bin`;
  return `${base}/backup/${encodeURIComponent(ws)}/snapshots`;
}

function authHeaders(): Record<string, string> {
  const token = getSettings().personalBackupToken.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Smoke-test connectivity. Used by the Settings UI's "Test connection"
 * button so the user gets a clear pass/fail before turning the sync on.
 * Returns null on success, or a human-readable error string on failure.
 */
export async function testConnection(): Promise<string | null> {
  const url = endpointFor('list');
  if (!url) return 'No URL configured.';
  try {
    const r = await fetch(url, { method: 'GET', headers: authHeaders() });
    if (r.status === 401) return 'Server rejected the token. Check the bearer token.';
    if (r.status === 501) return 'Backup is not enabled on this server. Set MONII_BACKUP_DIR.';
    if (!r.ok) return `Server returned ${r.status} ${r.statusText}.`;
    // The list endpoint should return JSON on success.
    await r.json();
    return null;
  } catch (e: any) {
    return e?.message ?? 'Connection failed.';
  }
}

// -- Sync orchestration --------------------------------------------------

async function pull(): Promise<void> {
  const url = endpointFor('snapshot');
  if (!url) return;
  setStatus({ kind: 'syncing', direction: 'pull' });
  try {
    const r = await fetch(url, { method: 'GET', headers: authHeaders() });
    if (r.status === 404) {
      // No snapshot yet — first device. Push our current state.
      await push();
      return;
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const blob = new Uint8Array(await r.arrayBuffer());
    const phrase = getSettings().syncRoom;
    const update = await decryptBytes(blob, phrase);
    Y.transact(getDoc(), () => Y.applyUpdate(getDoc(), update), ORIGIN_REMOTE_PULL);
    setSettingsField('personalBackupLastSyncedAt', Date.now());
    setStatus({ kind: 'connected' });
  } catch (e: any) {
    setStatus({ kind: 'error', message: e?.message ?? 'Pull failed.' });
    console.warn('[personal-backup] pull error', e);
  }
}

async function push(): Promise<void> {
  const url = endpointFor('snapshot');
  if (!url) return;
  setStatus({ kind: 'syncing', direction: 'push' });
  try {
    const phrase = getSettings().syncRoom;
    const update = Y.encodeStateAsUpdate(getDoc());
    const blob = await encryptBytes(update, phrase);
    const r = await fetch(url, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
      body: new Blob([blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer]),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    setSettingsField('personalBackupLastSyncedAt', Date.now());
    setStatus({ kind: 'connected' });
  } catch (e: any) {
    setStatus({ kind: 'error', message: e?.message ?? 'Push failed.' });
    console.warn('[personal-backup] push error', e);
  }
}

/** Bootstrap: pull once, then start the push observer + poll loop. */
export async function startPersonalBackupSync(): Promise<void> {
  const s = getSettings();
  if (!s.personalBackupEnabled || !s.personalBackupUrl.trim() || !s.syncRoom.trim()) return;
  await pull();
  if (!docObserver) {
    docObserver = (_update: Uint8Array, origin: any) => {
      if (origin === ORIGIN_REMOTE_PULL) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { void push(); }, PUSH_DEBOUNCE_MS);
    };
    getDoc().on('update', docObserver);
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => { void pull(); }, POLL_INTERVAL_MS);
  }
}

export function stopPersonalBackupSync(): void {
  if (docObserver) {
    getDoc().off('update', docObserver);
    docObserver = null;
  }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setStatus({ kind: 'idle' });
}

/** "Sync now" — immediate push. */
export async function forcePush(): Promise<void> {
  await push();
}

/** "Restore from backup" — immediate pull + apply. */
export async function forcePull(): Promise<void> {
  await pull();
}

/**
 * List historical versions. Returns the JSON the server gives us:
 *   [{ name: "<unix-ms>.bin", size, mtime }, ...]
 * Sorted newest-first.
 */
export async function listSnapshots(): Promise<Array<{ name: string; size: number; mtime: number }>> {
  const url = endpointFor('list');
  if (!url) return [];
  try {
    const r = await fetch(url, { method: 'GET', headers: authHeaders() });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

/**
 * Restore a specific historical version. The server has the URL
 * shape /backup/<ws>/snapshots/<name>. We download it, decrypt with
 * the current pairing phrase, and apply to the local doc.
 */
export async function restoreVersion(name: string): Promise<void> {
  const s = getSettings();
  let base = s.personalBackupUrl.trim();
  if (!base) throw new Error('No URL configured.');
  if (base.endsWith('/')) base = base.slice(0, -1);
  const ws = (s.personalBackupWorkspace || 'default').trim() || 'default';
  const url = `${base}/backup/${encodeURIComponent(ws)}/snapshots/${encodeURIComponent(name)}`;
  const r = await fetch(url, { method: 'GET', headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const blob = new Uint8Array(await r.arrayBuffer());
  const update = await decryptBytes(blob, s.syncRoom);
  Y.transact(getDoc(), () => Y.applyUpdate(getDoc(), update), ORIGIN_REMOTE_PULL);
  setSettingsField('personalBackupLastSyncedAt', Date.now());
}
