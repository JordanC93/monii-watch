/**
 * E2E encryption for the Google Drive sync transport.
 *
 * Threat model:
 *   - Google holds the bytes (the encrypted snapshot file in the user's
 *     own Drive)
 *   - Anyone with both the snapshot AND the pairing phrase can decrypt
 *   - Anyone with only the snapshot — Google, anyone with read access to
 *     the user's Drive folder, anyone who breaches Google's storage —
 *     sees opaque ciphertext and a tiny header
 *
 * # Algorithm choices (v2 — current)
 *
 *   - **KDF: Argon2id (RFC 9106)**, the modern winner of the Password
 *     Hashing Competition. Memory-hard, GPU/ASIC-resistant. PBKDF2 (used
 *     in v1) is straightforward to grind on a GPU farm; Argon2id forces
 *     an attacker to also pay memory bandwidth per guess. This is what
 *     libsodium, 1Password, Signal-server, and Bitwarden's vault use.
 *     Defaults: m=19 MiB, t=2, p=1 (OWASP 2024 minimum). Encoded into
 *     the blob header so we can crank up later without breaking
 *     compatibility.
 *
 *   - **Cipher: XChaCha20-Poly1305 (IRTF draft, libsodium standard)**.
 *     A 24-byte random nonce — large enough that random nonce reuse is
 *     statistically impossible (no birthday concerns at billions of
 *     messages). Constant-time on every CPU (no AES-NI dependency).
 *     This is what WireGuard, age, the Tor protocol, and Signal use.
 *
 *   - **AAD-bound header**: the entire format header (version + KDF
 *     params + cipher ID + salt + nonce) is bound into the AEAD as
 *     Additional Authenticated Data. An attacker can't strip the
 *     version byte or downgrade the KDF params without invalidating
 *     the Poly1305 tag.
 *
 * # Wire format v2
 *
 *   [0]    version          0x02
 *   [1]    kdf_id           0x01 = Argon2id
 *   [2-4]  kdf_m_kib (u24)  Argon2 memory cost in KiB, big-endian
 *   [5]    kdf_t            Argon2 time/iterations
 *   [6]    kdf_p            Argon2 parallelism (forced 1 in single-threaded JS)
 *   [7]    cipher_id        0x01 = XChaCha20-Poly1305
 *   [8-23] salt (16 B)      random per snapshot — Argon2id input
 *   [24-47] nonce (24 B)    random per snapshot — XChaCha20 input
 *   [48..]  ciphertext + 16-byte Poly1305 tag (AEAD output)
 *
 *   AAD = bytes [0..47] (entire header).
 *
 * # Backwards compatibility
 *
 *   `decryptBytes` accepts both v1 and v2 blobs. v1 = PBKDF2-SHA256-200k
 *   + AES-GCM-256 (the original implementation). v2 = the layout above.
 *   `encryptBytes` always produces v2. So a Drive snapshot encrypted
 *   under v1 by a previous app version will decrypt cleanly here, and
 *   the next push from any device upgrades it to v2.
 *
 * # Performance notes
 *
 *   Argon2id at m=19 MiB t=2 p=1 takes ~100-300 ms on a modern phone
 *   and ~30-80 ms on a fast laptop. Sync runs at most once every ~5 s
 *   (push debounce) and once every 60 s (poll), so the cost is well
 *   under 1% of CPU time even on slow devices. We don't cache derived
 *   keys deliberately — using a fresh per-snapshot salt + Argon2id is
 *   simpler and safer than maintaining a master/sub-key hierarchy.
 */

// @noble package exports require explicit `.js` suffix per their
// `exports` map. Vite + tsc handle this fine; Node ESM also requires it.
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

// ---- Format v2 ---------------------------------------------------------

const FORMAT_V2 = 0x02;
const KDF_ID_ARGON2ID = 0x01;
const CIPHER_ID_XCHACHA20_POLY1305 = 0x01;

const SALT_LEN = 16;
const NONCE_LEN = 24; // XChaCha20-Poly1305
const KEY_LEN = 32;   // 256-bit
const HEADER_LEN = 48; // 1+1+3+1+1+1 + 16 + 24

// OWASP 2024 minimum Argon2id parameters for password-derived keys.
// Encoded into the blob so we can raise these later without breaking old
// snapshots. Only run-time defaults — actual values are read back from
// the header on decrypt.
const DEFAULT_ARGON2_M_KIB = 19_456; // 19 MiB
const DEFAULT_ARGON2_T = 2;
const DEFAULT_ARGON2_P = 1;

// ---- Format v1 (legacy decrypt only) -----------------------------------

const FORMAT_V1 = 0x01;
const V1_SALT_LEN = 16;
const V1_IV_LEN = 12;
const V1_PBKDF2_ITERATIONS = 200_000;

// ---- Public API --------------------------------------------------------

/** Encrypt arbitrary bytes with a key derived from `passphrase`. Always
 *  produces a v2 blob. */
export async function encryptBytes(plaintext: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!passphrase) throw new Error('encryptBytes: empty passphrase');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));

  // Argon2id key derivation. Async API uses microtask-yielding so the
  // UI thread stays responsive during the ~100ms compute.
  const key = await argon2idAsync(passphrase, salt, {
    t: DEFAULT_ARGON2_T,
    m: DEFAULT_ARGON2_M_KIB,
    p: DEFAULT_ARGON2_P,
    dkLen: KEY_LEN,
  });

  // Build the header BEFORE encrypting — it's the AAD too.
  const header = buildV2Header({
    kdf_m_kib: DEFAULT_ARGON2_M_KIB,
    kdf_t: DEFAULT_ARGON2_T,
    kdf_p: DEFAULT_ARGON2_P,
    salt,
    nonce,
  });

  // XChaCha20-Poly1305 with the header as AAD. Any tampering with the
  // version byte or KDF params invalidates the auth tag → decrypt fails.
  const cipher = xchacha20poly1305(key, nonce, header);
  const ct = cipher.encrypt(plaintext);

  // Concat header || ciphertext-with-tag.
  const out = new Uint8Array(header.length + ct.length);
  out.set(header, 0);
  out.set(ct, header.length);
  // Best-effort wipe (JS GC will eventually collect; this just zeroes the
  // visible reference faster).
  key.fill(0);
  return out;
}

/** Decrypt a blob produced by `encryptBytes` (v1 or v2). Throws with a
 *  user-friendly message if the passphrase is wrong, the format is
 *  unrecognized, or the ciphertext was tampered with. */
export async function decryptBytes(blob: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!passphrase) throw new Error('decryptBytes: empty passphrase');
  if (blob.length < 1) throw new Error('decryptBytes: empty blob');

  const version = blob[0];
  if (version === FORMAT_V2) return decryptV2(blob, passphrase);
  if (version === FORMAT_V1) return decryptV1(blob, passphrase);
  throw new Error(`decryptBytes: unsupported format version 0x${version.toString(16)}`);
}

// ---- v2 internals ------------------------------------------------------

function buildV2Header(params: {
  kdf_m_kib: number; kdf_t: number; kdf_p: number;
  salt: Uint8Array; nonce: Uint8Array;
}): Uint8Array {
  const h = new Uint8Array(HEADER_LEN);
  h[0] = FORMAT_V2;
  h[1] = KDF_ID_ARGON2ID;
  // u24 BE for memory size — supports up to 16 GiB which is plenty.
  h[2] = (params.kdf_m_kib >>> 16) & 0xff;
  h[3] = (params.kdf_m_kib >>> 8)  & 0xff;
  h[4] = (params.kdf_m_kib >>> 0)  & 0xff;
  h[5] = params.kdf_t & 0xff;
  h[6] = params.kdf_p & 0xff;
  h[7] = CIPHER_ID_XCHACHA20_POLY1305;
  h.set(params.salt, 8);
  h.set(params.nonce, 8 + SALT_LEN);
  return h;
}

async function decryptV2(blob: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (blob.length < HEADER_LEN + 16) {
    throw new Error('decryptBytes: v2 blob too small');
  }
  const kdfId = blob[1];
  if (kdfId !== KDF_ID_ARGON2ID) {
    throw new Error(`decryptBytes: unsupported KDF id 0x${kdfId.toString(16)}`);
  }
  const cipherId = blob[7];
  if (cipherId !== CIPHER_ID_XCHACHA20_POLY1305) {
    throw new Error(`decryptBytes: unsupported cipher id 0x${cipherId.toString(16)}`);
  }
  const m = (blob[2] << 16) | (blob[3] << 8) | blob[4];
  const t = blob[5];
  const p = blob[6];
  // Defensive sanity bounds — refuse to spend gigabytes of RAM on a
  // hostile blob that claims absurd parameters.
  if (m < 1024 || m > 1_048_576) throw new Error(`decryptBytes: KDF memory ${m} KiB out of bounds`);
  if (t < 1 || t > 32) throw new Error(`decryptBytes: KDF iterations ${t} out of bounds`);
  if (p < 1 || p > 16) throw new Error(`decryptBytes: KDF parallelism ${p} out of bounds`);

  const salt = blob.slice(8, 8 + SALT_LEN);
  const nonce = blob.slice(8 + SALT_LEN, HEADER_LEN);
  const header = blob.slice(0, HEADER_LEN);
  const ct = blob.slice(HEADER_LEN);

  const key = await argon2idAsync(passphrase, salt, { t, m, p, dkLen: KEY_LEN });
  try {
    const cipher = xchacha20poly1305(key, nonce, header);
    const pt = cipher.decrypt(ct);
    return pt;
  } catch {
    throw new Error('Wrong pairing phrase — could not decrypt the snapshot.');
  } finally {
    key.fill(0);
  }
}

// ---- v1 internals (decrypt-only legacy) --------------------------------

async function decryptV1(blob: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (blob.length < 1 + V1_SALT_LEN + V1_IV_LEN + 16) {
    throw new Error('decryptBytes: v1 blob too small');
  }
  const salt = blob.slice(1, 1 + V1_SALT_LEN);
  const iv = blob.slice(1 + V1_SALT_LEN, 1 + V1_SALT_LEN + V1_IV_LEN);
  const ct = blob.slice(1 + V1_SALT_LEN + V1_IV_LEN);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    toAB(new TextEncoder().encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toAB(salt), iterations: V1_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, key, toAB(ct));
    return new Uint8Array(pt);
  } catch {
    throw new Error('Wrong pairing phrase — could not decrypt the v1 snapshot.');
  }
}

/**
 * TS 5.7 made Uint8Array generic over the buffer type, which breaks
 * direct passing to Web Crypto APIs that still expect a plain
 * ArrayBuffer-backed view. This materializes a copy backed by a
 * concrete ArrayBuffer (not SharedArrayBuffer).
 */
function toAB(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

// Re-export the human-readable suite labels from cryptoMeta.ts. The
// labels live in a separate dependency-free module so UIs that only
// want to display the active suite (SyncModal) don't trigger the noble
// imports and bloat the main bundle.
export { ENCRYPTION_LABEL, ENCRYPTION_DESCRIPTION } from './cryptoMeta';
