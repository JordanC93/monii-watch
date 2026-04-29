# Monii Watch self-hosted server

Tiny Node service that gives your Monii Watch devices both:

1. **A sync hub** — y-websocket protocol, native apps connect to keep
   data in sync even when peer-to-peer WebRTC isn't viable.
2. **A web UI** — the full Monii Watch SPA, served at the same URL,
   accessible from any browser on the network. Useful as a
   universal-access surface for devices that can't or shouldn't have
   a native install (work laptops, friends' phones, an iPad with no
   Apple Developer account).

**Optional** — Monii Watch works fine without it via WebRTC peer-to-peer.
Set this up only when you want hub-and-spoke sync + a self-hosted web UI.

This is part of the [Monii Watch](../README.md) project. Friends and
family sharing the app over WebRTC don't need any of this — they just
paste the pairing phrase. This server is for the power-user case where
you want your own always-on hub and an always-available web UI.

## What this gives you

- A single always-on endpoint your devices can sync through
- Resilience: a device coming online catches up against the server even
  if every other device is offline
- Optional disk persistence (LevelDB) so a server restart doesn't drop
  the in-memory snapshot
- Hub-and-spoke + WebRTC mesh together: Monii Watch keeps both
  transports active, so peer-to-peer still works on your LAN even when
  the server is unreachable
- **Self-hosted web UI** — open `http://<your-host>:1234/` in any
  browser and use the full app. No installer, no Mac required, no
  app-store gymnastics. Same UI as the iPad / desktop. Pair via the
  phrase to sync with your other devices.

## What this does NOT do

- It does **not** see your data in cleartext when sync clients connect
  if you put it behind a TLS proxy. The y-websocket protocol does NOT
  encrypt application data with the pairing phrase the way y-webrtc
  does — your TLS proxy is the line of defense. Run on your own box,
  on your own network, behind `wss://`
- It does not handle multi-user accounts, billing, or backups beyond
  the optional LevelDB snapshot
- The web UI does NOT phone home or sync without an explicit pairing
  phrase entered by the user. Each browser has its own local IndexedDB
  copy until paired.

## Run it

### Option A — Docker (recommended)

```bash
cd server
docker compose up -d --build
```

That gets you:

- `http://<your-host>:1234/` — web UI (any browser)
- `ws://<your-host>:1234/<doc-name>` — sync endpoint (native apps point at `ws://<your-host>:1234`)

The `--build` flag is important on first run — Docker compiles the SPA
from source as part of the multi-stage build, then bakes the static
files into the image. Subsequent `docker compose up -d` runs reuse
the cached image.

To rebuild after pulling new code:
```bash
git pull
docker compose up -d --build
```

### Option B — Bare Node (no Docker)

```bash
# 1) From the repo root: build the SPA
npm install
npm run build

# 2) Copy dist/ into server/public/ so the server can serve it
cp -r dist server/public

# 3) Run the server
cd server
npm install
npm start
```

```
[monii-sync] serving web UI from /Users/.../monii-watch/server/public
[monii-sync] listening on 0.0.0.0:1234
[monii-sync] web UI:  http://<your-host>:1234/
[monii-sync] sync ws: ws://<your-host>:1234/
```

### Sync-only mode (no web UI)

If you don't want the web UI, just don't put a `dist/` folder in
`server/public/`. The server detects the missing directory and runs
sync-only. The HTTP root then prints a hint instead of serving HTML.

### Behind TLS (recommended for anything off your LAN)

`y-websocket` is plain WebSocket. To get `wss://` and `https://` you
need a TLS proxy. The web UI requires `https://` for service-worker
caching to work outside `localhost`.

**Caddy (one-liner):**

```Caddyfile
monii.example.com {
  reverse_proxy 127.0.0.1:1234
}
```

Caddy auto-fetches a cert from Let's Encrypt and proxies both HTTP
and WebSocket on the same hostname. Done.

**nginx:**

```nginx
server {
  listen 443 ssl http2;
  server_name monii.example.com;
  ssl_certificate     /etc/letsencrypt/live/monii.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/monii.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:1234;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
  }
}
```

The `Upgrade`/`Connection: upgrade` headers are mandatory — those are
what let the same proxy serve both HTTP page loads and WebSocket sync
sessions.

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `1234` | TCP port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `MONII_PERSIST_DIR` | *(unset)* | Path for LevelDB on-disk persistence |
| `MONII_PUBLIC_DIR` | `./public` | Static-files root. Override to point at a custom UI build |

## Connecting your devices

### Native app (Mac / Windows / iOS)

1. Run the server (see above)
2. Open Monii Watch → **Settings → Sync**
3. Expand **Self-hosted server (advanced)**
4. Paste: `ws://<host>:1234` (LAN) or `wss://monii.example.com` (TLS)
5. Click Save. The status row should show **Server: connected**

### Web UI (any browser)

1. Open `http://<host>:1234/` (or `https://monii.example.com/` behind TLS)
2. Tap your way through the welcome tour
3. Settings → Sync → toggle on, paste the pairing phrase from your
   primary device. Within a few seconds, all your data populates.

You can paste either `ws://`, `wss://`, `http://`, or `https://` — the
app normalizes to the right scheme. The sync layer and the page-loading
layer are on the same server but use different protocols, automatically.

Both transports run in parallel: the WebRTC mesh stays active for
direct peer-to-peer sync on your LAN, and the websocket gives you the
hub.

## Updating

```bash
cd server
git pull
docker compose up -d --build   # or `npm run build` from root + `npm install && npm start`
```

The `--build` rebuilds the SPA so the web UI picks up your latest
changes. Without it, you'd serve a stale dist/ even after pulling.

## Troubleshooting

- **Web UI works but sync doesn't connect** — devices see `ws://<host>:1234`
  as your sync URL. Make sure that hostname/IP is reachable from the
  client's network and port 1234 isn't blocked by a firewall.
- **Sync works but web UI is blank / "Loading..."** — the SPA failed to
  hydrate. Open the browser's DevTools console; if you see CORS or
  "Failed to fetch" errors on `/assets/...`, check the `MONII_PUBLIC_DIR`
  is correctly set and the dist/ build succeeded.
- **Web UI loads but service worker errors** — service workers require
  `https://` (or `localhost`). Plain `http://` over LAN works for the
  page itself but disables the offline cache. Set up TLS for full PWA
  offline support.
- **Won't connect from outside LAN**: forward port 1234 (or your TLS
  port) on your router, and make sure your firewall allows inbound on
  that port.
- **Connects but doesn't sync**: every device must use the **same
  pairing phrase**. The server segregates docs by phrase; mismatched
  phrases land in different docs and never see each other.
- **"Server: reconnecting…" in the modal**: the URL is configured but the
  server isn't responding. Check `docker logs monii-sync` or the
  bare-node console.
- **Data missing after restart**: enable persistence by setting
  `MONII_PERSIST_DIR` and remounting the volume. Docker Compose does
  this by default.
