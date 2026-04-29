/**
 * Runtime device / layout detection.
 *
 * Tricky bit: iPadOS 13+ ships a desktop-class Safari user-agent that
 * reports `MacIntel` for `navigator.platform` and "Mac" in the UA
 * string by default. The reliable iPad signal is "Mac with touch":
 * `navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)` —
 * Macs don't have touch, iPads pretending to be Macs do.
 *
 * For iPhones the UA still says "iPhone" outright, so the simple
 * regex check works.
 */

/** True when running on any iOS device — iPhone, iPad, or iPod. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ "desktop site" mode masquerades as Mac.
  return navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform);
}

/** True when running on an iPad specifically. */
export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad/.test(navigator.userAgent)) return true;
  // iPadOS 13+ "desktop site" mode.
  return navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform);
}

/** True when running on an iPhone (or iPod) specifically. */
export function isIPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod/.test(navigator.userAgent) && !isIPad();
}

/** True for any device that primarily uses touch input. Used to pick
 *  defaults for things like swipe gestures and tap-target sizing. */
export function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
}

/** True when the runtime is the Tauri shell (desktop OR mobile). */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return !!(w.__TAURI_INTERNALS__ || w.__TAURI__);
}
