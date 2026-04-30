/**
 * Sync provider abstraction. The app supports two transports that can run
 * **independently or together**:
 *
 *   1. WebRTC P2P (`y-webrtc`) — the friends-and-family default. Devices
 *      discover each other through public signaling servers and form a mesh.
 *      Both devices need to be online at the same time for changes to sync.
 *      Encrypted with the pairing phrase.
 *
 *   2. WebSocket hub (`y-websocket`) — opt-in self-hosted. When the user
 *      sets `Settings.syncServerUrl`, the app also opens a websocket to that
 *      server. The server holds the doc state, so a device coming online
 *      catches up even if the other device is offline. Run on the user's
 *      Plex box / Raspberry Pi / cloud VM. See `server/README.md`.
 *
 * Local persistence (`y-indexeddb`) is independent of both — the app is
 * fully usable offline regardless of what's connected.
 *
 * IMPORTANT — modularity for non-tech sharing:
 *   - The websocket transport is OFF by default and entirely opt-in. Users
 *     who never touch the "Self-hosted server URL" field never load the
 *     y-websocket code path beyond the import (which is small).
 *   - WebRTC works without the server. The server works without WebRTC.
 *     Together they make a hub-and-spoke mesh that's resilient to either
 *     device being offline.
 */

import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { getDoc } from './doc';
import { getSettings, setSettingsField, isSettingsLoaded } from '../db/repo';
import { newSyncRoom } from '../domain/id';

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** Detailed connection state — finer-grained than SyncStatus, surfaced to the UI. */
export type SyncDetail = {
  /** Aggregate status (worst-case across enabled transports). */
  status: SyncStatus;
  /** WebRTC peer count. 0 if WebRTC isn't connected. */
  webrtcPeers: number;
  /** True if WebRTC is currently active. */
  webrtcActive: boolean;
  /** True if a websocket transport is currently active and connected. */
  wsActive: boolean;
  /** True if a websocket URL is configured (active or not). */
  wsConfigured: boolean;
  /** Last error message, if any. */
  error: string | null;
};

type Listener = (s: SyncStatus) => void;
type DetailListener = (d: SyncDetail) => void;

let persistence: IndexeddbPersistence | null = null;
let webrtc: WebrtcProvider | null = null;
let websocket: WebsocketProvider | null = null;
let status: SyncStatus = 'idle';
let lastError: string | null = null;
const listeners = new Set<Listener>();
const detailListeners = new Set<DetailListener>();

const DEFAULT_DOC_NAME = 'monii-watch-doc-v1';
const ACTIVE_WORKSPACE_KEY = 'monii:active-workspace';

/**
 * Resolve the active workspace's IndexedDB database name. Reads from
 * localStorage (`monii:active-workspace`); falls back to the default.
 *
 * Workspaces (Tier 9 #4) let users keep separate budgets — personal,
 * LLC, household — each with its own DB + sync room. The active
 * workspace is local-per-device (NOT synced) so different devices
 * can be on different workspaces.
 */
export function getActiveDocName(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (stored && /^monii-watch-doc-[a-z0-9-]+$/i.test(stored)) return stored;
  } catch {}
  return DEFAULT_DOC_NAME;
}

const DOC_NAME = getActiveDocName();

export function onSyncStatus(cb: Listener): () => void {
  listeners.add(cb);
  cb(status);
  return () => { listeners.delete(cb); };
}

export function onSyncDetail(cb: DetailListener): () => void {
  detailListeners.add(cb);
  cb(getSyncDetail());
  return () => { detailListeners.delete(cb); };
}

function setStatus(s: SyncStatus, err?: string) {
  status = s;
  if (err !== undefined) lastError = err || null;
  for (const l of listeners) l(s);
  emitDetail();
}

function emitDetail() {
  const d = getSyncDetail();
  for (const l of detailListeners) l(d);
}

export function getSyncStatus(): SyncStatus { return status; }

export function getSyncDetail(): SyncDetail {
  const wsConfigured = !!getSettings().syncServerUrl?.trim();
  return {
    status,
    webrtcPeers: peerCount(),
    webrtcActive: !!webrtc,
    wsActive: !!websocket && (websocket as any).wsconnected === true,
    wsConfigured,
    error: lastError,
  };
}

/**
 * Initialize the local IndexedDB persistence layer. Must run BEFORE the db
 * layer seeds, so we don't overwrite existing data with seed defaults.
 */
export async function initPersistence(): Promise<void> {
  if (persistence) return;
  const doc = getDoc();
  persistence = new IndexeddbPersistence(DOC_NAME, doc);
  await new Promise<void>((resolve) => persistence!.once('synced', () => resolve()));
}

/**
 * Initialize peer sync from settings. Runs WebRTC + (optionally) WebSocket
 * in parallel — they're independent transports.
 */
export async function initSync(): Promise<void> {
  if (!isSettingsLoaded()) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const settings = getSettings();
  if (settings.syncEnabled && settings.syncRoom) {
    connectWebrtc(settings.syncRoom);
    if (settings.syncServerUrl) {
      connectWebsocket(settings.syncServerUrl, settings.syncRoom);
    }
  }
}

// -- WebRTC transport ----------------------------------------------------

export function connectWebrtc(room: string) {
  disconnectWebrtc();
  setStatus('connecting');
  try {
    const doc = getDoc();
    webrtc = new WebrtcProvider(`monii-watch-${room}`, doc, {
      // Default y-webrtc signaling servers are public — fine for v1, but the
      // user can host their own later (Plex box, etc.) and we'll point here.
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
      password: room,
      maxConns: 8,
      filterBcConns: true,
    } as any);

    webrtc.on('status', (e: any) => {
      if (e.connected) setStatus('connected');
      emitDetail();
    });
    webrtc.on('peers', (e: any) => {
      if (e.webrtcPeers && e.webrtcPeers.length > 0) setStatus('connected');
      else if (!websocket || !(websocket as any).wsconnected) setStatus('connecting');
      emitDetail();
    });
  } catch (err: any) {
    console.warn('[sync] webrtc setup failed', err);
    setStatus('error', err?.message ?? String(err));
  }
}

export function disconnectWebrtc() {
  if (webrtc) {
    try { webrtc.disconnect(); webrtc.destroy(); } catch {}
    webrtc = null;
  }
  if (!websocket) setStatus('idle');
  emitDetail();
}

// -- WebSocket transport (self-hosted, optional) -------------------------

/**
 * Open a y-websocket connection to a self-hosted server. The server URL
 * should be a `ws://` or `wss://` endpoint pointing at a y-websocket
 * server (see `server/`). Room is appended as the doc name so multiple
 * users on the same server stay isolated by phrase.
 *
 * Safe to call without WebRTC also being active. Independent transport.
 */
export function connectWebsocket(serverUrl: string, room: string) {
  disconnectWebsocket();
  if (!serverUrl || !serverUrl.trim()) return;
  // Normalize: accept "https://x.com" and convert to "wss://x.com" so the
  // user can paste either; ws/wss already works as-is.
  let url = serverUrl.trim().replace(/\/+$/, '');
  if (url.startsWith('https://')) url = 'wss://' + url.slice(8);
  else if (url.startsWith('http://')) url = 'ws://' + url.slice(7);
  setStatus('connecting');
  try {
    const doc = getDoc();
    websocket = new WebsocketProvider(url, `monii-watch-${room}`, doc, {
      // y-websocket reconnects automatically on drop. Default backoff is fine.
      connect: true,
      // y-websocket doesn't natively encrypt the stream the way y-webrtc does
      // with its room password. The server holds the doc in memory; if the
      // user wants strong encryption-at-rest, they should run the server
      // behind a TLS proxy and inside their own network.
    });
    websocket.on('status', (e: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      if (e.status === 'connected') setStatus('connected');
      else if (e.status === 'disconnected' && (!webrtc || peerCount() === 0)) setStatus('connecting');
      emitDetail();
    });
    websocket.on('connection-error', (err: any) => {
      console.warn('[sync] websocket error', err);
      setStatus('error', `WebSocket: ${err?.message ?? 'connection failed'}`);
    });
  } catch (err: any) {
    console.warn('[sync] websocket setup failed', err);
    setStatus('error', err?.message ?? String(err));
  }
}

export function disconnectWebsocket() {
  if (websocket) {
    try { websocket.disconnect(); websocket.destroy(); } catch {}
    websocket = null;
  }
  if (!webrtc) setStatus('idle');
  emitDetail();
}

// -- Top-level toggles ---------------------------------------------------

/** Toggle sync on/off; persists the flag and reconnects all configured transports. */
export function setSyncEnabled(enabled: boolean) {
  setSettingsField('syncEnabled', enabled);
  if (enabled) {
    const settings = getSettings();
    let room = settings.syncRoom;
    if (!room) {
      room = newSyncRoom();
      setSettingsField('syncRoom', room);
    }
    connectWebrtc(room);
    if (settings.syncServerUrl) connectWebsocket(settings.syncServerUrl, room);
  } else {
    disconnectWebrtc();
    disconnectWebsocket();
  }
}

export function setSyncRoom(room: string) {
  setSettingsField('syncRoom', room);
  const settings = getSettings();
  if (settings.syncEnabled) {
    connectWebrtc(room);
    if (settings.syncServerUrl) connectWebsocket(settings.syncServerUrl, room);
  }
}

/**
 * Set or clear the self-hosted server URL. Reconnects the websocket
 * transport accordingly. Empty string disables it.
 *
 * Modular by design — clearing this field doesn't touch WebRTC.
 */
export function setSyncServerUrl(url: string) {
  const trimmed = url.trim();
  setSettingsField('syncServerUrl', trimmed);
  const settings = getSettings();
  if (!settings.syncEnabled) return;
  if (trimmed) connectWebsocket(trimmed, settings.syncRoom);
  else disconnectWebsocket();
}

/** Number of peers currently connected via WebRTC. */
export function peerCount(): number {
  if (!webrtc) return 0;
  // y-webrtc exposes `room.webrtcConns`; cast to access internals
  const room: any = (webrtc as any).room;
  if (!room) return 0;
  return room.webrtcConns?.size ?? 0;
}
