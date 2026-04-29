/**
 * Monii Watch self-hosted server (sync hub + optional web UI).
 *
 * Runs on your Plex box / NAS / Raspberry Pi / cloud VM. Two services
 * on the same port:
 *
 *   1. WebSocket sync at every URL path (handled by y-websocket).
 *      Native apps and the web UI alike connect to
 *      `ws://<host>:<port>/<doc-name>` to sync.
 *
 *   2. HTTP static file server at `/`. When a `public/` directory
 *      exists alongside this script, every browser GET serves the
 *      pre-built Monii Watch SPA from there. That gives any device on
 *      the network access to the full app via a URL — no native install
 *      required for an iPad / Linux laptop / friend's machine.
 *
 * The two protocols share a port without conflict because Tauri's
 * sync clients send an `Upgrade: websocket` HTTP header that triggers
 * the protocol switch; plain HTTP requests fall through to static
 * file serving.
 *
 * Environment variables:
 *   PORT              TCP port to listen on (default 1234)
 *   HOST              Bind address (default 0.0.0.0 — all interfaces)
 *   MONII_PERSIST_DIR Optional path for on-disk persistence (LevelDB)
 *   MONII_PUBLIC_DIR  Override the static-file root (default ./public)
 *
 * The web UI is OPTIONAL — if `MONII_PUBLIC_DIR` doesn't exist, the
 * server runs as a sync-only hub and the HTTP root prints a hint.
 *
 * Run: `npm install && npm start`
 *
 * Behind a TLS proxy (Caddy / nginx) is recommended for `wss://` /
 * `https://` URLs. See README.md.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PERSIST_DIR = process.env.MONII_PERSIST_DIR || '';
const PUBLIC_DIR = process.env.MONII_PUBLIC_DIR || path.join(__dirname, 'public');

// MIME-type lookup — covers everything Vite / the PWA bundle emits.
const MIME = {
  '.html':        'text/html; charset=utf-8',
  '.htm':         'text/html; charset=utf-8',
  '.js':          'application/javascript; charset=utf-8',
  '.mjs':         'application/javascript; charset=utf-8',
  '.css':         'text/css; charset=utf-8',
  '.json':        'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png':         'image/png',
  '.jpg':         'image/jpeg',
  '.jpeg':        'image/jpeg',
  '.gif':         'image/gif',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.woff':        'font/woff',
  '.woff2':       'font/woff2',
  '.ttf':         'font/ttf',
  '.txt':         'text/plain; charset=utf-8',
};

// -----------------------------------------------------------------------
// Optional disk persistence (y-leveldb). Loaded on demand so the bare
// install path stays small.
// -----------------------------------------------------------------------
if (PERSIST_DIR) {
  try {
    const { LeveldbPersistence } = await import('y-leveldb');
    const persistence = new LeveldbPersistence(PERSIST_DIR);
    setPersistence({
      bindState: async (docName, ydoc) => {
        const persisted = await persistence.getYDoc(docName);
        const Y = await import('yjs');
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
        ydoc.on('update', (update) => persistence.storeUpdate(docName, update));
      },
      writeState: async () => {},
      provider: persistence,
    });
    console.log(`[monii-sync] persistence enabled at ${PERSIST_DIR}`);
  } catch (e) {
    console.warn(`[monii-sync] persistence requested but y-leveldb not installed; running in-memory.`);
    console.warn(`[monii-sync] install with: npm install y-leveldb`);
    console.warn(`[monii-sync] underlying error:`, e?.message ?? e);
  }
}

// -----------------------------------------------------------------------
// Static file serving (web UI).
// -----------------------------------------------------------------------
const publicDirExists = fs.existsSync(PUBLIC_DIR) && fs.statSync(PUBLIC_DIR).isDirectory();
const publicDirResolved = publicDirExists ? path.resolve(PUBLIC_DIR) : null;

if (publicDirExists) {
  console.log(`[monii-sync] serving web UI from ${publicDirResolved}`);
} else {
  console.log(`[monii-sync] no web UI bundled at ${PUBLIC_DIR} — running sync-only`);
  console.log(`[monii-sync] to serve the web app from this server, copy your dist/ folder there`);
}

function serveStatic(req, res) {
  if (!publicDirExists) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Monii Watch sync server. WebSocket sync endpoint at this same URL.\n\n' +
      'To serve the web app from this server, build the SPA (`npm run build`)\n' +
      'and copy the `dist/` folder to ' + PUBLIC_DIR + '\n',
    );
    return;
  }

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.join(publicDirResolved, urlPath);
  // Defense-in-depth against directory traversal — `path.join` collapses
  // `..` segments but the resulting path could still escape the root.
  const resolved = path.resolve(filePath);
  if (resolved !== publicDirResolved && !resolved.startsWith(publicDirResolved + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback for client-side routes (/budget, /reports, etc.):
      // serve index.html when the requested path doesn't look like a
      // static asset (no file extension).
      const looksLikeAsset = /\.[a-z0-9]{1,8}$/i.test(urlPath);
      if (!looksLikeAsset) {
        const indexPath = path.join(publicDirResolved, 'index.html');
        fs.readFile(indexPath, (err2, data) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': MIME['.html'],
            'Cache-Control': 'no-cache',
          });
          res.end(data);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    // index.html and the service worker should never get cached aggressively
    // — clients need to see updates promptly. Hashed assets (built by Vite
    // with /assets/index-<hash>.js) can be cached forever.
    const isLongCacheable = /\/assets\//.test(urlPath) && /\.[a-z0-9]{8,}\.[a-z]+$/.test(urlPath);
    const cacheHeader = isLongCacheable
      ? 'public, max-age=31536000, immutable'
      : (ext === '.html' || urlPath.includes('/sw.js') || urlPath.includes('/workbox-')
          ? 'no-cache'
          : 'public, max-age=3600');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheHeader,
      'Content-Length': stats.size,
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

// -----------------------------------------------------------------------
// HTTP + WebSocket server on one port.
// -----------------------------------------------------------------------
const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Any WebSocket upgrade request becomes a y-websocket sync session.
  // The URL path is the doc name (Monii Watch uses `monii-watch-<phrase>`).
  // Browsers GET'ing the same paths get the static file handler instead,
  // because GET is HTTP and doesn't include `Upgrade: websocket`.
  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request, { gc: true });
  });
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? '<your-host>' : HOST;
  console.log(`[monii-sync] listening on ${HOST}:${PORT}`);
  if (publicDirExists) {
    console.log(`[monii-sync] web UI:  http://${displayHost}:${PORT}/`);
  }
  console.log(`[monii-sync] sync ws: ws://${displayHost}:${PORT}/`);
  console.log(`[monii-sync] (put behind a TLS proxy for https:// + wss:// in production)`);
});
