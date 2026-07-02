/**
 * Pairing-phrase → public room-identifier derivation.
 *
 * Iron Rule #14: the pairing phrase IS the encryption key. It is the
 * y-webrtc stream password AND the KDF input for the Drive / personal
 * backup snapshots. Before this module existed, the app sent
 * `monii-watch-<phrase>` verbatim to the PUBLIC y-webrtc signaling
 * servers as the room name — meaning the signaling operators (and
 * anyone sniffing that hop) learned the master key.
 *
 * Fix: the identifiers that leave the device are one-way SHA-256
 * derivations of the phrase, domain-separated by prefix:
 *
 *   webrtc/websocket room  = "monii-" + hex(sha256("monii-room:" + phrase)).slice(0, 32)
 *   y-webrtc password      = hex(sha256("monii-pw:" + phrase))
 *
 * The RAW phrase remains the KDF input for the Drive / personal-server
 * snapshot encryption (crypto.ts, Argon2id) — that never leaves the
 * device, so it is unchanged.
 *
 * =========================================================================
 * COMPATIBILITY BREAK (changelog item!): devices running an app version
 * WITHOUT this derivation join room `monii-watch-<phrase>` with password
 * `<phrase>`; devices WITH it join `monii-<sha256-prefix>` with the
 * derived password. They will never see each other. ALL devices sharing
 * a pairing phrase must be on the same app version to pair. Existing
 * phrases keep working — only the wire identifiers changed.
 * =========================================================================
 *
 * Web Crypto only (crypto.subtle is available in every target: browsers,
 * WKWebView, WebView2, and Node ≥ 18 for tests).
 */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  let out = '';
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Public room name shared with signaling / websocket servers.
 * 128 bits of the hash — plenty to avoid collisions, reveals nothing
 * about the phrase.
 */
export async function deriveRoomName(phrase: string): Promise<string> {
  const hex = await sha256Hex('monii-room:' + phrase);
  return `monii-${hex.slice(0, 32)}`;
}

/**
 * y-webrtc stream password. Domain-separated from the room name so
 * knowing one derivation never yields the other.
 */
export async function deriveRoomPassword(phrase: string): Promise<string> {
  return sha256Hex('monii-pw:' + phrase);
}
