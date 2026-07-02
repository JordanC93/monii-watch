/**
 * Round-trip tests for the sync-transport encryption layer.
 *
 * The pairing phrase IS the encryption key (Iron Rule #14) — these
 * tests pin the contract every snapshot transport (Drive, personal
 * server, iCloud folder) depends on:
 *
 *   - v2 (Argon2id + XChaCha20-Poly1305) encrypt → decrypt round-trips
 *   - a wrong phrase rejects
 *   - a tampered ciphertext or header rejects (AAD-bound Poly1305 tag)
 *   - legacy v1 blobs (PBKDF2-SHA256-200k + AES-GCM-256) still decrypt
 *
 * The v1 ENCRYPT path was removed from crypto.ts on purpose (v2-only
 * writes), so the v1 fixture is synthesized here with Web Crypto,
 * following the documented v1 wire format:
 *
 *   [0]      version 0x01
 *   [1-16]   salt (16 B)
 *   [17-28]  iv (12 B)
 *   [29..]   AES-GCM ciphertext + tag
 *
 * Runs under vitest's node environment: @noble/hashes + @noble/ciphers
 * are pure JS (no WASM), and Node ships Web Crypto as `globalThis.crypto`.
 * Argon2id at the OWASP-minimum params takes ~100 ms per call, so the
 * suite stays fast.
 */

import { describe, expect, it } from 'vitest';
import { encryptBytes, decryptBytes } from './crypto';

const PHRASE = 'correct-horse-battery';
const WRONG_PHRASE = 'wrong-horse-battery';

function samplePlaintext(): Uint8Array {
  // Deterministic non-trivial payload — resembles a small Yjs update.
  const bytes = new Uint8Array(512);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
  return bytes;
}

/** TS 5.7 made Uint8Array generic over its buffer; Web Crypto wants a
 *  plain-ArrayBuffer-backed view. Same helper shape as crypto.ts. */
function toAB(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

/** Build a v1-format blob (PBKDF2-SHA256-200k + AES-GCM-256) so the
 *  legacy decrypt path stays covered even though the v1 encrypt path
 *  no longer exists in crypto.ts. */
async function encryptV1(plaintext: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toAB(plaintext)));
  const out = new Uint8Array(1 + salt.length + iv.length + ct.length);
  out[0] = 0x01;
  out.set(salt, 1);
  out.set(iv, 1 + salt.length);
  out.set(ct, 1 + salt.length + iv.length);
  return out;
}

describe('encryptBytes / decryptBytes (v2)', () => {
  it('round-trips arbitrary bytes', async () => {
    const plaintext = samplePlaintext();
    const blob = await encryptBytes(plaintext, PHRASE);
    expect(blob[0]).toBe(0x02); // always writes v2
    const decrypted = await decryptBytes(blob, PHRASE);
    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  it('produces a different blob per call (fresh salt + nonce)', async () => {
    const plaintext = samplePlaintext();
    const a = await encryptBytes(plaintext, PHRASE);
    const b = await encryptBytes(plaintext, PHRASE);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('rejects a wrong pairing phrase', async () => {
    const blob = await encryptBytes(samplePlaintext(), PHRASE);
    await expect(decryptBytes(blob, WRONG_PHRASE)).rejects.toThrow(/wrong pairing phrase/i);
  });

  it('rejects tampered ciphertext (bit flip in the payload)', async () => {
    const blob = await encryptBytes(samplePlaintext(), PHRASE);
    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 1] ^= 0x01; // flip a bit in the Poly1305 tag region
    await expect(decryptBytes(tampered, PHRASE)).rejects.toThrow(/wrong pairing phrase/i);
    const tamperedBody = new Uint8Array(blob);
    tamperedBody[48] ^= 0x01; // flip the first ciphertext byte after the 48-byte header
    await expect(decryptBytes(tamperedBody, PHRASE)).rejects.toThrow(/wrong pairing phrase/i);
  });

  it('rejects tampered header (KDF params are AAD-bound)', async () => {
    const blob = await encryptBytes(samplePlaintext(), PHRASE);
    const tampered = new Uint8Array(blob);
    tampered[5] = 1; // downgrade kdf_t from 2 to 1 — must invalidate the tag
    await expect(decryptBytes(tampered, PHRASE)).rejects.toThrow(/wrong pairing phrase/i);
  });

  it('rejects an empty passphrase and unknown format versions', async () => {
    await expect(encryptBytes(samplePlaintext(), '')).rejects.toThrow(/empty passphrase/i);
    await expect(decryptBytes(new Uint8Array([0x02]), '')).rejects.toThrow(/empty passphrase/i);
    await expect(decryptBytes(new Uint8Array([0x7f, 1, 2, 3]), PHRASE)).rejects.toThrow(/unsupported format/i);
  });
});

describe('decryptBytes (v1 legacy)', () => {
  it('still decrypts v1 blobs (PBKDF2 + AES-GCM)', async () => {
    const plaintext = samplePlaintext();
    const blob = await encryptV1(plaintext, PHRASE);
    expect(blob[0]).toBe(0x01);
    const decrypted = await decryptBytes(blob, PHRASE);
    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  it('rejects a wrong pairing phrase on v1 blobs', async () => {
    const blob = await encryptV1(samplePlaintext(), PHRASE);
    await expect(decryptBytes(blob, WRONG_PHRASE)).rejects.toThrow(/wrong pairing phrase/i);
  });
});
