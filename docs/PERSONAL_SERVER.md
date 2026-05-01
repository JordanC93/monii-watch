# Personal server: realtime sync + encrypted backup

The Monii Watch sync binary in `server/` does two things for you, both
optional, both opt-in:

1. **Realtime WebSocket sync** (always available). Devices connect to
   the server and stay in step in real time, even when other devices
   are offline.
2. **Encrypted snapshot backup** (optional). The app uploads encrypted
   snapshots on a debounced cadence. The server keeps a few historical
   versions for rollback. Server holds opaque ciphertext.

Run the binary on your Plex box, NAS, Raspberry Pi, home server, or
cloud VM. One process, two features. Pick whichever you want, run
both, or just one.

## Quickstart with Docker

```bash
git clone https://github.com/JordanC93/monii-watch
cd monii-watch/server
# Edit docker-compose.yml to set env vars (see below).
docker compose up -d
```

The server starts on port 1234 by default.

## Quickstart without Docker

Requires Node.js 18 or newer.

```bash
git clone https://github.com/JordanC93/monii-watch
cd monii-watch/server
npm install
MONII_PERSIST_DIR=./data \
MONII_BACKUP_DIR=./backups \
MONII_BACKUP_TOKEN=$(openssl rand -hex 32) \
npm start
```

Set up a systemd service or pm2 daemon so it restarts on reboot.

## Environment variables

| Variable | What it does | Default |
|---|---|---|
| `PORT` | TCP port to listen on. | `1234` |
| `HOST` | Bind address. `0.0.0.0` listens on all interfaces. | `0.0.0.0` |
| `MONII_PERSIST_DIR` | Path for the realtime sync's LevelDB persistence. Empty = in-memory only (state lost on restart). | (empty) |
| `MONII_PUBLIC_DIR` | Override the static-file root if you want to serve the SPA from this server too. | `./public` |
| `MONII_BACKUP_DIR` | Path for encrypted backup snapshots. When set, the `/backup/*` HTTP API turns on. | (empty, backup off) |
| `MONII_BACKUP_TOKEN` | Bearer token. When set, the app must include it in `Authorization: Bearer <token>`. | (empty, unauthenticated) |
| `MONII_BACKUP_KEEP` | How many historical snapshots to keep per workspace. Older ones roll off. | `10` |

## Wire format (backup endpoint)

The app talks to four routes under `/backup/<workspace>/`. The
`<workspace>` slug must match `^[a-z0-9][a-z0-9_-]{0,47}$` and
defaults to `default`.

| Method | Path | What it does |
|---|---|---|
| `PUT` | `/backup/<ws>/snapshot.bin` | Upload the latest snapshot. Body is the raw ciphertext. The server keeps a copy in `snapshots/<unix-ms>.bin` AND writes to `snapshot.bin`. |
| `GET` | `/backup/<ws>/snapshot.bin` | Download the latest. |
| `GET` | `/backup/<ws>/snapshots` | List historical versions. JSON: `[{ name, size, mtime }, ...]`, newest first. |
| `GET` | `/backup/<ws>/snapshots/<name>` | Download a specific version. |
| `OPTIONS` | any | CORS preflight. |

When `MONII_BACKUP_TOKEN` is set, every request must include
`Authorization: Bearer <token>`. Mismatch returns 401 with no body.

## Encryption

The server holds opaque ciphertext. The app encrypts the Yjs state
with XChaCha20-Poly1305 via Argon2id key derivation (RFC 9106) using
the user's pairing phrase BEFORE upload. Anyone with filesystem
access to `MONII_BACKUP_DIR` sees random bytes. The encryption code
lives in `src/sync/crypto.ts`.

The server has no concept of users, accounts, or auth beyond the
single optional bearer token. It is a dumb encrypted blob store.

## Production deployment

On the open internet, run behind a TLS reverse proxy. The server's
README.md has copy-paste recipes for Caddy and nginx. The short
version: terminate TLS at the proxy, point it at
`http://localhost:1234`, and the app uses `https://` and `wss://`
URLs.

## Security recommendations

- Always set `MONII_BACKUP_TOKEN` unless the server is on a private
  LAN with no other users.
- Use a long random token. `openssl rand -hex 32` is fine.
- Run the server as a non-root user.
- Restrict `MONII_BACKUP_DIR` permissions so only the server's user
  can read it.
- TLS is mandatory if the server is reachable from the internet,
  otherwise the bearer token is exposed in transit.
