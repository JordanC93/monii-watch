/**
 * Cashbook self-hosted sync server (y-websocket).
 *
 * This is the *server* that Cashbook clients connect to when you've
 * configured `Settings → Sync → Self-hosted server URL` in the app.
 *
 * It is OPTIONAL. The app works fine without it via WebRTC peer-to-peer.
 * Set this up only when you want hub-and-spoke sync (so a device coming
 * online can catch up even if the other device is offline).
 *
 * - In-memory document store. Restart loses the in-memory copy, but every
 *   client also has a complete local copy in IndexedDB and re-syncs on
 *   reconnect, so this is safe.
 *
 * - To persist documents to disk between restarts, set `CASHBOOK_PERSIST_DIR`
 *   to a writable directory. The y-leveldb persistence plugin is loaded
 *   on demand if present.
 *
 * Environment variables:
 *   PORT             — TCP port to listen on (default: 1234)
 *   HOST             — bind address (default: 0.0.0.0 — all interfaces)
 *   CASHBOOK_PERSIST_DIR — optional, path for on-disk persistence
 *
 * Run: `npm install && npm start`
 *
 * Behind a TLS proxy (Caddy / nginx) is recommended for `wss://` URLs.
 * See README.md for example configs.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils.js';

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PERSIST_DIR = process.env.CASHBOOK_PERSIST_DIR || '';

// Optional disk persistence — only loaded when configured. Saves the doc to
// LevelDB so a server restart doesn't drop the in-memory snapshot.
if (PERSIST_DIR) {
  try {
    const { LeveldbPersistence } = await import('y-leveldb');
    const persistence = new LeveldbPersistence(PERSIST_DIR);
    setPersistence({
      bindState: async (docName, ydoc) => {
        const persisted = await persistence.getYDoc(docName);
        const update = persisted ? new Uint8Array(0) : new Uint8Array(0);
        // y-leveldb's getYDoc applies the snapshot to a fresh doc; we need
        // to merge into the live ydoc instead.
        const Y = await import('yjs');
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
        ydoc.on('update', (update) => persistence.storeUpdate(docName, update));
        // Avoid lint warning on unused.
        void update;
      },
      writeState: async () => {},
      provider: persistence,
    });
    console.log(`[cashbook-sync] persistence enabled at ${PERSIST_DIR}`);
  } catch (e) {
    console.warn(`[cashbook-sync] persistence requested but y-leveldb not installed; running in-memory.`);
    console.warn(`[cashbook-sync] install with: npm install y-leveldb`);
    console.warn(`[cashbook-sync] underlying error:`, e?.message ?? e);
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Cashbook sync server. WebSocket endpoint only.\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
  // y-websocket's setupWSConnection takes care of the protocol handshake,
  // gc, doc lookup, and broadcast.
  setupWSConnection(conn, req, {
    // Doc name is taken from the URL path. Cashbook uses `cashbook-<phrase>`.
    gc: true,
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[cashbook-sync] listening on ${HOST}:${PORT}`);
  console.log(`[cashbook-sync] point Cashbook at:  ws://<your-host>:${PORT}`);
  console.log(`[cashbook-sync] (use wss:// behind a TLS proxy in production)`);
});
