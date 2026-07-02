/**
 * Device-local sync metadata (last-synced timestamps per transport).
 *
 * WHY THIS EXISTS — the infinite push loop:
 *
 * The Drive and personal-server providers used to record their
 * "last synced at" timestamp via `setSettingsField(...)`, which writes
 * into the SYNCED Yjs settings map. Each provider also watches the Yjs
 * doc for local changes and schedules a debounced push when one lands.
 * The timestamp write IS a doc change, so every completed push scheduled
 * another push 5 seconds later — forever. Worse, the timestamp
 * replicated to peers over WebRTC/websocket and triggered THEIR push
 * observers too.
 *
 * "When did *this device* last talk to the backup endpoint" is
 * inherently per-device state, so it lives in localStorage — same
 * rationale as the workspace registry and layout preference. The old
 * `Settings.googleDriveLastSyncedAt` / `Settings.personalBackupLastSyncedAt`
 * fields still exist in types.ts for back-compat with old docs, but
 * nothing writes them anymore.
 *
 * No Yjs, no React imports — subscribe/notify so React components can
 * hook in via `useSyncExternalStore`.
 */

export type SyncMetaTransport = 'drive' | 'personal-server';

const KEY_PREFIX = 'monii:last-synced:';

type Listener = () => void;
const listeners = new Set<Listener>();

function keyFor(transport: SyncMetaTransport): string {
  return `${KEY_PREFIX}${transport}`;
}

/** Millisecond timestamp of the last successful sync on THIS device, or 0. */
export function getLastSyncedAt(transport: SyncMetaTransport): number {
  try {
    const raw = localStorage.getItem(keyFor(transport));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Record a successful sync. Notifies subscribers so the UI re-renders. */
export function setLastSyncedAt(transport: SyncMetaTransport, ms: number): void {
  try {
    localStorage.setItem(keyFor(transport), String(ms));
  } catch { /* private mode / quota — non-fatal, UI just shows nothing */ }
  for (const l of listeners) l();
}

/**
 * Subscribe to changes. Shaped for `useSyncExternalStore`:
 *   const at = useSyncExternalStore(subscribeSyncMeta, () => getLastSyncedAt('drive'));
 */
export function subscribeSyncMeta(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
