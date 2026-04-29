# Google Drive sync (optional, end-to-end encrypted)

A third sync transport, alongside WebRTC P2P and the self-hosted server.
This one uses **your own** Google Drive as the storage backend.

The data is **end-to-end encrypted in your browser** before it leaves
the device. Google holds an opaque blob; Google can't read your
budget.

**Encryption suite (v2 — current):**

- **Cipher**: **XChaCha20-Poly1305** (RFC draft, libsodium standard).
  24-byte random nonce per snapshot — collision is statistically
  impossible. Constant-time on every CPU. Same algorithm WireGuard,
  Signal, and the Tor protocol use.
- **KDF**: **Argon2id** (RFC 9106, winner of the Password Hashing
  Competition). 19 MiB memory cost, 2 iterations (OWASP 2024 minimum
  for password-derived keys). Memory-hard — defeats GPU/ASIC brute-force
  farms in a way PBKDF2 cannot. Same KDF Bitwarden, 1Password, and
  libsodium use.
- **Authenticated header**: the entire format header (version, KDF
  parameters, cipher ID, salt, nonce) is bound into the Poly1305 auth
  tag as Additional Authenticated Data. An attacker who tries to
  modify the version byte or downgrade the KDF parameters invalidates
  the tag — decrypt fails closed.
- **Per-snapshot fresh randomness**: 16-byte salt and 24-byte nonce
  are regenerated on every encrypt. Two snapshots from the same
  passphrase produce completely different ciphertext bytes; KDF
  output is unique per snapshot.

**Backwards compatibility**: snapshots produced by earlier versions
(format v1: PBKDF2-SHA256 + AES-GCM-256) decrypt cleanly via the
legacy code path. The next push from any device upgrades the on-Drive
snapshot to v2.

## When this is the right choice

- ✅ You don't want to run a server but want sync that works when only
  one device is online (the WebRTC limitation)
- ✅ You already pay nothing for Drive and have free space
- ✅ You're comfortable with Google holding the (encrypted) bytes

## When this is the wrong choice

- ❌ You're sharing the app with friends/family who don't have Google
  accounts — stick with WebRTC P2P
- ❌ You don't want any third-party storing anything related to your
  finances, even encrypted — run the self-hosted server instead
- ❌ You have only one device — sync at all is unnecessary

## Setup (one-time, ~5 minutes)

### 1. Create a Google Cloud OAuth client

Monii Watch needs a tiny Google Cloud project so the OAuth flow knows who's
asking. This is free and takes a few minutes.

1. Go to <https://console.cloud.google.com/projectcreate>
2. Project name: `Monii Watch` (or anything)
3. Click **Create**
4. From the project picker (top bar), select your new project
5. Go to **APIs &amp; Services → Library**, search for "Google Drive API",
   click it, and click **Enable**
6. Go to **APIs &amp; Services → OAuth consent screen**:
   - **User type:** External
   - **App name:** `Monii Watch`
   - **User support email:** your email
   - **Developer contact:** your email
   - Save and continue
   - **Scopes:** click "Add or remove scopes", search for
     `auth/drive.file`, check it, click Update
   - Save and continue through the rest with defaults
   - Add yourself (and anyone you want to share access with) as a
     **Test User** — without this, OAuth will say "App not verified"
7. Go to **APIs &amp; Services → Credentials → Create credentials → OAuth
   client ID**:
   - **Application type:** Web application
   - **Name:** Monii Watch
   - **Authorized JavaScript origins:** add the origin where you run
     the app (e.g. `https://monii.example.com`, or
     `http://localhost:5173` for dev)
   - **Authorized redirect URIs:** add the **same URL** the app runs
     at — the OAuth popup redirects back to this exact URL with the
     token in the hash. Example:
     `https://monii.example.com/`
   - Click **Create**
8. Copy the **Client ID** that appears (looks like
   `123456-abcdef.apps.googleusercontent.com`)

If you install Monii Watch on multiple origins (e.g. one PWA URL + one
Tauri build), add each origin AND each redirect URI to the same OAuth
client. The app uses `window.location.origin + window.location.pathname`
as the redirect URI, so make sure each install's URL is in the list.

### 2. Connect Monii Watch

1. In Monii Watch, open **Settings → Sync**
2. Make sure you have a pairing phrase set (the field at the top —
   if it's empty, generate one). **This phrase is your encryption
   password — write it down.** Lose it and the encrypted Drive snapshot
   is unrecoverable
3. Expand the **Google Drive (advanced)** section
4. Paste your OAuth client ID
5. Click **Connect Google Drive** — a Google sign-in popup appears
6. Sign in, grant the `drive.file` permission

That's it. The app immediately uploads an encrypted snapshot to a
folder called `Monii Watch (E2E encrypted)` in your Drive root.

### 3. Connect your other devices

On each additional device:

1. Install Monii Watch
2. **Set the same pairing phrase** in Settings → Sync (this is
   critical — the same phrase is what lets the new device decrypt
   what's already in Drive)
3. Open the Drive section → paste **the same OAuth client ID** →
   click Connect → sign in
4. Within seconds it pulls + decrypts the existing snapshot

The pairing phrase is the encryption key. The OAuth client ID is just
how Google knows it's your app asking. You can use the same client ID
across all your devices.

## What gets stored

A single encrypted file in `Drive / Monii Watch (E2E encrypted) /
monii-watch-snapshot.bin`. Format v2:

```
[0]      version          0x02
[1]      kdf_id           0x01 (Argon2id)
[2..4]   kdf_m_kib (u24)  Argon2 memory cost in KiB (default 19456 = 19 MiB)
[5]      kdf_t            Argon2 iterations (default 2)
[6]      kdf_p            Argon2 parallelism (default 1)
[7]      cipher_id        0x01 (XChaCha20-Poly1305)
[8..23]  salt (16 B)      random per snapshot — Argon2id input
[24..47] nonce (24 B)     random per snapshot — XChaCha20 input
[48..]   ciphertext + 16-byte Poly1305 tag (AEAD output, AAD = bytes 0..47)
```

The file is overwritten on every sync, so Drive doesn't accumulate
history. If you want history, use Drive's built-in version history
(right-click the file → Manage versions). Older snapshots in version
history are still v1 or v2 blobs — they decrypt only with the same
pairing phrase that was active when they were written.

## Sync cadence

- **On boot**: pull once, merge into local
- **On local change**: debounced 5 seconds after the last edit, push
  the latest snapshot
- **Polling**: every 60 seconds, pull again to catch changes from
  other devices

All three transports (WebRTC mesh, self-hosted server, Drive) run
**independently and in parallel**. You can use any combination — Drive
+ WebRTC works great, Drive alone works too, all three together is
fine.

## Disconnecting

Settings → Sync → Google Drive section → **Disconnect**.

This:

- Stops the push and poll loops immediately
- Drops the access token from local settings
- Leaves the snapshot **untouched** on Drive — you can re-connect later
  and pick up where you left off, or delete the file from Drive
  manually if you want a clean break

The pairing phrase is unchanged. Your local data is unchanged.

## Troubleshooting

- **"Wrong pairing phrase — could not decrypt"**: the phrase on this
  device doesn't match the one used to encrypt the snapshot. Set the
  matching phrase in the field at the top of the Sync modal.
- **"Popup blocked"**: your browser blocked the OAuth popup. Allow
  popups for this site and try Connect again.
- **"App not verified" Google warning**: you didn't add yourself as a
  Test User in the Google Cloud OAuth consent screen. Go back and add
  your email under "Test users". The warning goes away once you're a
  test user, OR after you publish the OAuth consent screen (which
  requires Google to verify the app — overkill for personal use, just
  use Test Users).
- **"Re-auth needed" badge in the modal**: the access token expired
  (1-hour lifetime). Click Re-authorize to get a fresh one. (We use
  the implicit grant on purpose — it doesn't issue refresh tokens, so
  there's no long-lived secret to leak from a stolen device.)
- **Slow first sync**: the OAuth round-trip + folder lookup + initial
  upload takes 1–3 seconds. Subsequent syncs are sub-second because the
  folder/file IDs are cached in settings.

## Privacy guarantees

What Google can see:
- That a Monii Watch user has uploaded an opaque blob to their Drive
- The size of the blob (proxy for "how much budget data you have")
- The timestamps of upload activity

What Google **cannot** see:
- Any account names, transaction descriptions, amounts, payees, goals,
  or settings
- Your pairing phrase (it never leaves your device — only the derived
  AES key is computed locally, used once, and discarded per snapshot)

What we (the app maintainers) can see:
- Nothing. The OAuth client is yours; the data is yours; we don't
  operate any infrastructure
