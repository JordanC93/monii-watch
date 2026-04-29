/**
 * Encryption suite labels — pulled out of `crypto.ts` so the SyncModal
 * (and any other UI that wants to display the active suite) can import
 * them WITHOUT pulling in the @noble/hashes + @noble/ciphers deps.
 *
 * Static strings only; no runtime crypto here. Keep this file tiny and
 * dependency-free.
 */

export const ENCRYPTION_LABEL = 'XChaCha20-Poly1305 + Argon2id';

export const ENCRYPTION_DESCRIPTION =
  'XChaCha20-Poly1305 (24-byte nonce) with Argon2id key derivation ' +
  '(RFC 9106, 19 MiB memory cost, 2 iterations). Snapshot header is bound ' +
  'into the auth tag — downgrade attacks fail.';
