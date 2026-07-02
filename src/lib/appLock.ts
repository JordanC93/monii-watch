/**
 * App lock (privacy / Tier 13 #5).
 *
 * Optional PIN-based lock screen. When enabled:
 *   - Shown once on cold boot (locks at startup)
 *   - Re-locks after `appLockTimeoutMinutes` of background time
 *   - Successful unlock unblocks the rest of the app
 *
 * Per-device, NOT synced. The user can have lock enabled on their
 * phone but not their desktop. The synced `Settings.appLockEnabled`
 * carries the master "is lock on" flag so the user remembers, but
 * the actual hash + salt live in localStorage.
 *
 * PIN hashing: PBKDF2-SHA256 with 200k iterations, 16-byte salt.
 * Same parameters as the legacy crypto module, sufficient for a
 * 4-6 digit PIN. We don't claim military-grade — the lock is a
 * "shoulder surfing / phone-passed-around" deterrent, not protection
 * against a forensic attacker (who would just decrypt the IndexedDB).
 *
 * Web Crypto API only — no third-party dependency.
 */

const LS_HASH_KEY = 'monii:applock-hash';
const LS_SALT_KEY = 'monii:applock-salt';
const LS_LAST_UNLOCK_KEY = 'monii:applock-last-unlock';
const LS_BG_AT_KEY = 'monii:applock-bg-at';
const LS_FAILS_KEY = 'monii:applock-fails';
const LS_LOCKOUT_KEY = 'monii:applock-lockout-until';
const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// Attempt throttling. A 4-digit PIN is 10k guesses; without a delay it
// can be scripted against the UI in minutes. After FREE_ATTEMPTS
// consecutive failures each further failure imposes a lockout that
// doubles, capped at LOCKOUT_MAX_MS. Reset on success.
const FREE_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 30_000;
const LOCKOUT_MAX_MS = 30 * 60_000;

function getFailCount(): number {
  try { return parseInt(localStorage.getItem(LS_FAILS_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

/** Milliseconds until another PIN attempt is allowed; 0 = allowed now. */
export function getLockoutRemainingMs(): number {
  try {
    const until = parseInt(localStorage.getItem(LS_LOCKOUT_KEY) ?? '0', 10) || 0;
    return Math.max(0, until - Date.now());
  } catch {
    return 0;
  }
}

function recordFailure(): void {
  try {
    const fails = getFailCount() + 1;
    localStorage.setItem(LS_FAILS_KEY, String(fails));
    if (fails >= FREE_ATTEMPTS) {
      const over = fails - FREE_ATTEMPTS; // 0 on the 5th failure
      const ms = Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** over);
      localStorage.setItem(LS_LOCKOUT_KEY, String(Date.now() + ms));
    }
  } catch { /* private mode — throttling degrades, verify still works */ }
}

function recordSuccess(): void {
  try {
    localStorage.removeItem(LS_FAILS_KEY);
    localStorage.removeItem(LS_LOCKOUT_KEY);
  } catch { /* ignore */ }
}

/** Whether a PIN has been set on THIS device. */
export function hasLocalPin(): boolean {
  try {
    return !!localStorage.getItem(LS_HASH_KEY) && !!localStorage.getItem(LS_SALT_KEY);
  } catch {
    return false;
  }
}

/** Generate a fresh salt + derive a hash for a new PIN. */
export async function setLocalPin(pin: string): Promise<void> {
  if (pin.length < 4) throw new Error('PIN must be at least 4 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt);
  try {
    localStorage.setItem(LS_HASH_KEY, bytesToBase64(hash));
    localStorage.setItem(LS_SALT_KEY, bytesToBase64(salt));
    localStorage.setItem(LS_LAST_UNLOCK_KEY, String(Date.now()));
  } catch (err) {
    throw new Error(`Couldn't store PIN: ${(err as Error)?.message ?? err}`);
  }
}

/** Remove the local PIN — used when the master toggle is turned off. */
export function clearLocalPin(): void {
  try {
    localStorage.removeItem(LS_HASH_KEY);
    localStorage.removeItem(LS_SALT_KEY);
    localStorage.removeItem(LS_LAST_UNLOCK_KEY);
    localStorage.removeItem(LS_BG_AT_KEY);
    localStorage.removeItem(LS_FAILS_KEY);
    localStorage.removeItem(LS_LOCKOUT_KEY);
  } catch { /* ignore */ }
}

/** Verify a candidate PIN against the stored hash. Constant-time-ish via subtle.
 *  Refuses (returns false without deriving) while a failure lockout is
 *  active — check `getLockoutRemainingMs()` first to show the user why. */
export async function verifyLocalPin(candidate: string): Promise<boolean> {
  try {
    if (getLockoutRemainingMs() > 0) return false;
    const hashB64 = localStorage.getItem(LS_HASH_KEY);
    const saltB64 = localStorage.getItem(LS_SALT_KEY);
    if (!hashB64 || !saltB64) return false;
    const salt = base64ToBytes(saltB64);
    const expected = base64ToBytes(hashB64);
    const actual = await derive(candidate, salt);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) {
      diff |= actual[i] ^ expected[i];
    }
    if (diff === 0) {
      recordSuccess();
      try { localStorage.setItem(LS_LAST_UNLOCK_KEY, String(Date.now())); } catch {}
      return true;
    }
    recordFailure();
    return false;
  } catch {
    return false;
  }
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  // Cast salt to ArrayBuffer for the deriveBits API. The TS lib types
  // for SubtleCrypto don't accept ArrayBufferLike-backed Uint8Array
  // directly — we slice into a fresh ArrayBuffer to avoid the
  // SharedArrayBuffer mismatch.
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new Uint8Array(saltBuf), iterations: ITERATIONS, hash: 'SHA-256' },
    keyMat,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Background-state tracking. The lock engine listens for visibility
// changes and stamps the time the app went to background; on
// foreground, if `now - bgAt > timeout`, lock the app again.

export function markBackgroundedNow(): void {
  try { localStorage.setItem(LS_BG_AT_KEY, String(Date.now())); } catch {}
}

/**
 * Should the app re-lock after returning from the background?
 * Returns true when:
 *   - Lock is enabled
 *   - A PIN exists on this device
 *   - The app has been backgrounded for more than `timeoutMinutes`
 */
export function shouldRelock(timeoutMinutes: number): boolean {
  if (!hasLocalPin()) return false;
  try {
    const bg = parseInt(localStorage.getItem(LS_BG_AT_KEY) ?? '0', 10);
    if (!bg) return false;
    const elapsedMin = (Date.now() - bg) / 60_000;
    return elapsedMin >= timeoutMinutes;
  } catch {
    return false;
  }
}

export function clearBackgroundMark(): void {
  try { localStorage.removeItem(LS_BG_AT_KEY); } catch {}
}
