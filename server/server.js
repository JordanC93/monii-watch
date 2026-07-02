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
 *   HOST              Bind address (default 0.0.0.0, all interfaces)
 *   MONII_PERSIST_DIR Optional path for on-disk persistence (LevelDB)
 *   MONII_PUBLIC_DIR  Override the static-file root (default ./public)
 *   MONII_BACKUP_DIR  Optional path for the personal-backup HTTP store.
 *                     When set, the server exposes a small REST API at
 *                     /backup/* for upload + download of encrypted
 *                     snapshots from the app. See "Personal backup" in
 *                     the README for the wire format.
 *   MONII_BACKUP_TOKEN Optional bearer token. When set, requests must
 *                     include Authorization: Bearer <token>. REQUIRED
 *                     when the server binds to a non-loopback address —
 *                     without it the /backup routes refuse to serve
 *                     (503) instead of exposing snapshots to the LAN.
 *   MONII_BACKUP_KEEP Number of historical snapshots to retain per
 *                     workspace (default 10). Older snapshots roll off.
 *   MONII_SYNC_TOKEN  Optional bearer token for the WebSocket sync
 *                     endpoint. When set, clients must include
 *                     `?token=<token>` on the ws URL (the app supports
 *                     pasting the server URL with `?token=...`).
 *   MONII_ALLOWED_ORIGINS Comma-separated origin allowlist for CORS on
 *                     the /backup routes. When unset, cross-origin
 *                     access is allowed only when MONII_BACKUP_TOKEN
 *                     guards the routes (otherwise any website the
 *                     user visits could probe a LAN server).
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
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PERSIST_DIR = process.env.MONII_PERSIST_DIR || '';
const PUBLIC_DIR = process.env.MONII_PUBLIC_DIR || path.join(__dirname, 'public');
const BACKUP_DIR = process.env.MONII_BACKUP_DIR || '';
const BACKUP_TOKEN = process.env.MONII_BACKUP_TOKEN || '';
const BACKUP_KEEP = parseInt(process.env.MONII_BACKUP_KEEP || '10', 10);
const SYNC_TOKEN = process.env.MONII_SYNC_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.MONII_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const IS_LOOPBACK_BIND = HOST === '127.0.0.1' || HOST === '::1' || HOST === 'localhost';

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
// Personal backup HTTP store.
//
// Layout on disk:
//   <BACKUP_DIR>/<workspace>/snapshot.bin           (the latest pointer)
//   <BACKUP_DIR>/<workspace>/snapshots/<unix-ms>.bin  (versioned copies)
//
// Wire format:
//
//   GET  /backup/<workspace>/snapshot.bin
//        Returns the latest encrypted blob, or 404 if absent.
//
//   PUT  /backup/<workspace>/snapshot.bin
//        Accepts a raw binary body. Writes it as the new latest, AND
//        keeps a copy in /snapshots/<unix-ms>.bin. Rolls off all but
//        the most recent BACKUP_KEEP versioned copies.
//
//   GET  /backup/<workspace>/snapshots
//        Returns JSON: [{ name, size, mtime }, ...] sorted by mtime
//        descending. Useful for surfacing "you have 7 backups" in the
//        app and for restoring an older version.
//
//   GET  /backup/<workspace>/snapshots/<name>
//        Returns a specific historical snapshot.
//
// Auth: when MONII_BACKUP_TOKEN is set, every request must include
//   Authorization: Bearer <token>. Mismatched / missing token returns
//   401 with no body.
//
// Encryption: blobs are opaque to the server. The app encrypts them
//   with the user's pairing phrase before upload (XChaCha20-Poly1305 +
//   Argon2id, see src/sync/crypto.ts). Anyone with filesystem access
//   to BACKUP_DIR sees only ciphertext.
// -----------------------------------------------------------------------
const backupEnabled = !!BACKUP_DIR;
if (backupEnabled) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[monii-sync] personal backup enabled at ${BACKUP_DIR}`);
    if (!BACKUP_TOKEN) {
      if (IS_LOOPBACK_BIND) {
        console.log('[monii-sync] MONII_BACKUP_TOKEN not set — backups unauthenticated (loopback-only bind, acceptable)');
      } else {
        console.log('[monii-sync] WARNING: MONII_BACKUP_TOKEN not set and server is reachable beyond loopback — /backup routes will refuse requests (503) until a token is configured');
      }
    }
  } catch (e) {
    console.warn(`[monii-sync] backup dir could not be created at ${BACKUP_DIR}:`, e?.message ?? e);
  }
}

const WORKSPACE_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
const SNAPSHOT_NAME_RE = /^[0-9]{1,16}\.bin$/;

/** Constant-time token comparison — `===` leaks match length/prefix timing. */
function tokenMatches(candidate, expected) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function backupAuthOk(req) {
  if (!BACKUP_TOKEN) return true;
  const header = req.headers.authorization || '';
  return tokenMatches(header, `Bearer ${BACKUP_TOKEN}`);
}

/**
 * CORS policy for the /backup routes. With an explicit allowlist, echo
 * only matching origins. Without one, allow cross-origin access only
 * when a bearer token guards the routes — an unauthenticated LAN server
 * with `*` CORS lets any website the user visits probe it.
 */
function corsHeaders(req) {
  const base = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  };
  if (ALLOWED_ORIGINS.length > 0) {
    const origin = req.headers.origin || '';
    return ALLOWED_ORIGINS.includes(origin)
      ? { ...base, 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
      : {};
  }
  return BACKUP_TOKEN ? { ...base, 'Access-Control-Allow-Origin': '*' } : {};
}

function jsonResponse(req, res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

function plainResponse(req, res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...corsHeaders(req),
  });
  res.end(text);
}

function workspaceDir(workspace) {
  // WORKSPACE_RE (checked by the caller) already excludes separators and
  // dots, but keep a real containment check as defense-in-depth. (The
  // previous version compared the resolved path to itself — always true.)
  const root = path.resolve(BACKUP_DIR);
  const safe = path.resolve(root, workspace);
  if (safe === root || !safe.startsWith(root + path.sep)) return null;
  return safe;
}

async function handleBackupRoute(req, res, urlPath) {
  // CORS preflight — the desktop / web app may run on a different
  // origin from the backup server, so OPTIONS needs to ack the
  // Authorization header up front (policy in corsHeaders()).
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (!backupEnabled) {
    plainResponse(req, res, 501, 'Personal backup is not configured on this server. Set MONII_BACKUP_DIR.\n');
    return;
  }
  // Refuse to serve unauthenticated backups beyond loopback. Without a
  // token, anyone who can reach the port could PUT unlimited blobs
  // (disk-fill) and GET every workspace's ciphertext for offline
  // brute-force against its pairing phrase.
  if (!BACKUP_TOKEN && !IS_LOOPBACK_BIND) {
    plainResponse(req, res, 503,
      'Personal backup requires MONII_BACKUP_TOKEN when the server is reachable beyond loopback.\n');
    return;
  }
  if (!backupAuthOk(req)) {
    plainResponse(req, res, 401, 'Unauthorized\n');
    return;
  }

  // Parse: /backup/<workspace>/...
  const parts = urlPath.replace(/^\/backup\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) {
    jsonResponse(req, res, 200, { ok: true, message: 'monii-sync backup endpoint' });
    return;
  }
  const workspace = parts[0];
  if (!WORKSPACE_RE.test(workspace)) {
    plainResponse(req, res, 400, 'Bad workspace name\n');
    return;
  }
  const wsDir = workspaceDir(workspace);
  if (!wsDir) {
    plainResponse(req, res, 400, 'Invalid path\n');
    return;
  }

  const sub = parts.slice(1).join('/');

  // PUT /backup/<ws>/snapshot.bin — upload latest
  if (req.method === 'PUT' && sub === 'snapshot.bin') {
    fs.mkdirSync(path.join(wsDir, 'snapshots'), { recursive: true });
    const chunks = [];
    let total = 0;
    const MAX_BYTES = 64 * 1024 * 1024; // 64 MiB cap, way over what we'd ever ship
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (total > MAX_BYTES) {
        plainResponse(req, res, 413, 'Payload too large\n');
        return;
      }
      const body = Buffer.concat(chunks, total);
      const stamp = Date.now();
      const versioned = path.join(wsDir, 'snapshots', `${stamp}.bin`);
      const latest = path.join(wsDir, 'snapshot.bin');
      try {
        fs.writeFileSync(versioned, body);
        fs.writeFileSync(latest, body);
        // Roll off old versioned copies.
        const all = fs.readdirSync(path.join(wsDir, 'snapshots'))
          .filter((n) => SNAPSHOT_NAME_RE.test(n))
          .sort()
          .reverse();
        for (const name of all.slice(BACKUP_KEEP)) {
          try { fs.unlinkSync(path.join(wsDir, 'snapshots', name)); } catch {}
        }
        jsonResponse(req, res, 200, { ok: true, size: body.length, stamp });
      } catch (e) {
        plainResponse(req, res, 500, `Write failed: ${e?.message ?? e}\n`);
      }
    });
    req.on('error', () => plainResponse(req, res, 400, 'Read error\n'));
    return;
  }

  // GET /backup/<ws>/snapshot.bin — download latest
  if (req.method === 'GET' && sub === 'snapshot.bin') {
    const file = path.join(wsDir, 'snapshot.bin');
    fs.stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        plainResponse(req, res, 404, 'No snapshot yet\n');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size,
        'Last-Modified': stats.mtime.toUTCString(),
        ...corsHeaders(req),
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  // GET /backup/<ws>/snapshots — list versions
  if (req.method === 'GET' && (sub === 'snapshots' || sub === 'snapshots/')) {
    const dir = path.join(wsDir, 'snapshots');
    if (!fs.existsSync(dir)) {
      jsonResponse(req, res, 200, []);
      return;
    }
    const entries = fs.readdirSync(dir)
      .filter((n) => SNAPSHOT_NAME_RE.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(dir, name));
        return { name, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    jsonResponse(req, res, 200, entries);
    return;
  }

  // GET /backup/<ws>/snapshots/<name> — download a specific version
  if (req.method === 'GET' && sub.startsWith('snapshots/')) {
    const name = sub.slice('snapshots/'.length);
    if (!SNAPSHOT_NAME_RE.test(name)) {
      plainResponse(req, res, 400, 'Bad snapshot name\n');
      return;
    }
    const file = path.join(wsDir, 'snapshots', name);
    fs.stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        plainResponse(req, res, 404, 'Not Found\n');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size,
        ...corsHeaders(req),
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  plainResponse(req, res, 405, 'Method not allowed\n');
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
  // Malformed percent-encoding (e.g. GET /%) throws URIError — uncaught,
  // it would kill the whole Node process from one crafted request.
  let urlPathForRouting;
  try {
    urlPathForRouting = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  // Personal backup endpoint takes priority over static files. Routes
  // under /backup are handled by the JSON / binary handler above.
  if (urlPathForRouting === '/backup' || urlPathForRouting.startsWith('/backup/')) {
    handleBackupRoute(req, res, urlPathForRouting);
    return;
  }

  if (!publicDirExists) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Monii Watch sync server. WebSocket sync endpoint at this same URL.\n\n' +
      'To serve the web app from this server, build the SPA (`npm run build`)\n' +
      'and copy the `dist/` folder to ' + PUBLIC_DIR + '\n',
    );
    return;
  }

  let urlPath = urlPathForRouting;
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
  // The URL path is the doc name (a SHA-256 derivation of the pairing
  // phrase as of v0.7.31 — the raw phrase no longer travels the wire).
  // Browsers GET'ing the same paths get the static file handler instead,
  // because GET is HTTP and doesn't include `Upgrade: websocket`.
  //
  // Optional auth: when MONII_SYNC_TOKEN is set, the client must pass
  // `?token=<token>` on the ws URL (the app forwards it from a server
  // URL entered as `wss://host?token=...`).
  if (SYNC_TOKEN) {
    let ok = false;
    try {
      const q = new URL(request.url, 'http://localhost').searchParams;
      ok = tokenMatches(q.get('token') || '', SYNC_TOKEN);
    } catch { ok = false; }
    if (!ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }
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
  if (backupEnabled) {
    console.log(`[monii-sync] backup:  http://${displayHost}:${PORT}/backup/<workspace>/snapshot.bin`);
  }
  console.log(`[monii-sync] (put behind a TLS proxy for https:// + wss:// in production)`);
});
