/**
 * Device-local secrets + private sync state (localStorage).
 *
 * WHY THIS EXISTS — the leaked-token problem:
 *
 * The Google Drive OAuth access token used to live in the SYNCED Yjs
 * settings map (`Settings.googleAccessToken`). Settings replicate to
 * every paired device over WebRTC / websocket / Drive itself — so
 * enabling Drive sync silently handed the user's Google bearer token
 * to every family member they paired with. A bearer token IS the
 * credential; anyone holding it can call the Drive API as that user.
 *
 * Credentials are inherently per-device state, so they live in
 * localStorage — same rationale as syncMeta.ts, the workspace
 * registry, and the layout preference. The legacy Settings fields
 * still exist in types.ts for back-compat with old docs; a one-time
 * migration in driveProvider.ts moves a legacy token in here and
 * blanks the synced fields.
 *
 * No Yjs, no React imports — subscribe/notify so React components can
 * hook in via `useSyncExternalStore` (mirrors syncMeta.ts).
 */

const KEY_GOOGLE_TOKEN = 'monii:secret:google-access-token';
const KEY_GOOGLE_TOKEN_EXPIRES = 'monii:secret:google-access-token-expires-at';
const KEY_DRIVE_LAST_MODIFIED_PREFIX = 'monii:secret:drive-last-modified:';
const KEY_PERSONAL_BACKUP_TOKEN = 'monii:secret:personal-backup-token';

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeString(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* private mode / quota — non-fatal */ }
}

/** The Google Drive OAuth access token for THIS device, or ''. */
export function getGoogleAccessToken(): string {
  return readString(KEY_GOOGLE_TOKEN);
}

/** Unix-ms expiry of the token, or 0 when unknown / absent. */
export function getGoogleAccessTokenExpiresAt(): number {
  const raw = readString(KEY_GOOGLE_TOKEN_EXPIRES);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Store (or with '' clear) the token. Notifies subscribers. */
export function setGoogleAccessToken(token: string, expiresAt: number): void {
  writeString(KEY_GOOGLE_TOKEN, token);
  writeString(KEY_GOOGLE_TOKEN_EXPIRES, expiresAt > 0 ? String(expiresAt) : '');
  notify();
}

export function clearGoogleAccessToken(): void {
  setGoogleAccessToken('', 0);
}

/** Plain synchronous read used by the Drive boot gate in main.tsx. */
export function hasDriveToken(): boolean {
  return !!getGoogleAccessToken();
}

/** The personal backup server's bearer token for THIS device, or ''. */
export function getPersonalBackupToken(): string {
  return readString(KEY_PERSONAL_BACKUP_TOKEN);
}

/** Store (or with '' clear) the token. Notifies subscribers. */
export function setPersonalBackupToken(token: string): void {
  writeString(KEY_PERSONAL_BACKUP_TOKEN, token);
  notify();
}

export function clearPersonalBackupToken(): void {
  setPersonalBackupToken('');
}

/**
 * Last Drive `modifiedTime` (RFC 3339 string) THIS device has seen for
 * the given workspace's snapshot file. Recorded after every successful
 * pull / push; compared before every push so a newer remote snapshot
 * gets merged first instead of clobbered. Not strictly a secret, but
 * the same device-local-only storage rules apply (Iron Rule #22 shape).
 */
export function getDriveLastSeenModifiedTime(workspaceId: string): string {
  return readString(KEY_DRIVE_LAST_MODIFIED_PREFIX + workspaceId);
}

export function setDriveLastSeenModifiedTime(workspaceId: string, modifiedTime: string): void {
  writeString(KEY_DRIVE_LAST_MODIFIED_PREFIX + workspaceId, modifiedTime);
}

/**
 * Subscribe to changes. Shaped for `useSyncExternalStore`:
 *   const token = useSyncExternalStore(subscribeLocalSecrets, getGoogleAccessToken);
 */
export function subscribeLocalSecrets(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
