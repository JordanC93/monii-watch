# Cashbook self-hosted sync server

Tiny Node service that gives your Cashbook devices a hub to sync through.
**Optional** — Cashbook works fine without it via WebRTC peer-to-peer. Set
this up only when you want hub-and-spoke sync (so a device coming online
catches up even if the other device is offline).

This is part of the [Cashbook](../README.md) project. Friends and family
sharing the app over WebRTC don't need any of this — they just paste the
pairing phrase. This server is for power users who want their own hub.

## What this gives you

- A single always-on endpoint your devices can sync through
- Resilience: a device coming online catches up against the server even if
  every other device is offline
- Optional disk persistence (LevelDB) so a server restart doesn't drop
  the in-memory snapshot
- Hub-and-spoke + WebRTC mesh together: Cashbook keeps both transports
  active, so peer-to-peer still works on your LAN even when the server
  is unreachable

## What this does NOT do

- It does **not** see your data in cleartext if you put it behind a TLS
  proxy. The y-websocket protocol does NOT encrypt application data with
  the pairing phrase the way y-webrtc does — your TLS proxy is the line
  of defense. Run on your own box, on your own network, behind `wss://`
- It does not handle multi-user accounts, billing, or backups beyond the
  optional LevelDB snapshot

## Run it

### Option A — Docker (recommended)

```bash
cd server
docker compose up -d
```

That gets you `ws://<your-host>:1234`. Point Cashbook at it via Settings →
Sync → Self-hosted server.

### Option B — Bare Node

```bash
cd server
npm install
npm start
```

```
[cashbook-sync] listening on 0.0.0.0:1234
[cashbook-sync] point Cashbook at:  ws://<your-host>:1234
```

### Behind TLS (recommended for anything off your LAN)

`y-websocket` is plain WebSocket. To get `wss://` you need a TLS proxy.

**Caddy (one-liner):**

```Caddyfile
sync.example.com {
  reverse_proxy 127.0.0.1:1234
}
```

**nginx:**

```nginx
server {
  listen 443 ssl http2;
  server_name sync.example.com;
  ssl_certificate     /etc/letsencrypt/live/sync.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:1234;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
  }
}
```

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `1234` | TCP port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `CASHBOOK_PERSIST_DIR` | *(unset)* | Path for LevelDB on-disk persistence |

## Connecting Cashbook to it

1. Run the server (see above)
2. Open Cashbook → Settings → Sync
3. Expand **Self-hosted server (advanced)**
4. Paste the URL: `ws://<host>:1234` (LAN) or `wss://sync.example.com` (TLS)
5. Click Save. The status row should show **Server: connected**

You can paste either `ws://`, `wss://`, `http://`, or `https://` — the app
normalizes to the right scheme.

Both transports run in parallel: the WebRTC mesh stays active for direct
peer-to-peer sync on your LAN, and the websocket gives you the hub.

## Updating

```bash
cd server
git pull
docker compose up -d --build   # or `npm install && npm start`
```

## Troubleshooting

- **Won't connect from outside LAN**: forward port 1234 (or your TLS
  port) on your router, and make sure your firewall allows inbound on
  that port.
- **Connects but doesn't sync**: every device must use the **same pairing
  phrase**. The server segregates docs by phrase; mismatched phrases land
  in different docs and never see each other.
- **"Server: reconnecting…" in the modal**: the URL is configured but the
  server isn't responding. Check `docker logs cashbook-sync` or the
  bare-node console.
- **Data missing after restart**: enable persistence by setting
  `CASHBOOK_PERSIST_DIR` and remounting the volume. Docker Compose does
  this by default.
