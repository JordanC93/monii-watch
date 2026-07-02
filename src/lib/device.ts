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

/** True when the host is macOS (covers Tauri's WKWebView on Mac, the
 *  PWA in Safari/Chrome on Mac, and the dev server when run on Mac).
 *  iPadOS spoofs Mac in its UA, so explicitly exclude touch devices. */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isIPad() || isIPhone()) return false;
  // Modern: navigator.userAgentData.platform; fallback: legacy navigator.platform.
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) return /mac/i.test(uaData.platform);
  return /Mac/.test(navigator.platform);
}

/**
 * Boot-time hook that stamps `data-tauri-os` on `<html>` so CSS can
 * scope rules like the macOS traffic-light inset. Idempotent — safe
 * to call multiple times.
 *
 * Runs on every host (Tauri or browser); the attribute is just a
 * platform tag. CSS rules can layer additional scoping like
 * `[data-tauri-os="macos"]:where(...)` if needed.
 */
export function applyHostAttributes(): void {
  if (typeof document === 'undefined') return;
  let os: string | null = null;
  if (isMacOS()) os = 'macos';
  else if (typeof navigator !== 'undefined' && /Win/.test(navigator.platform)) os = 'windows';
  else if (typeof navigator !== 'undefined' && /Linux/.test(navigator.platform)) os = 'linux';
  if (os) document.documentElement.setAttribute('data-host-os', os);
  if (isTauri()) document.documentElement.setAttribute('data-host-tauri', '1');
  applyIOSViewportGuard();
}

/**
 * v0.7.31 — iOS input focus-zoom guard.
 *
 * iOS auto-zooms the page when a focused input's font-size is below
 * 16px, and this app's compact typography (14px base, many 11.5-12.5px
 * inputs) trips it on every field. The classic remedy — bumping every
 * input to 16px — would visibly enlarge the whole compact UI, so
 * instead we add `maximum-scale=1` to the viewport meta, ON iOS ONLY:
 *
 *   - Safari / PWA (iOS ≥ 10): deliberately IGNORES maximum-scale for
 *     pinch gestures (accessibility override) but still honors it to
 *     suppress the focus auto-zoom. Best of both.
 *   - WKWebView (Capacitor build): honors maximum-scale fully, so
 *     in-app pinch zoom is disabled — matching the app's pre-v0.7.31
 *     behavior there. System accessibility zoom (Settings →
 *     Accessibility → Zoom) still works at the OS layer.
 *   - Every other platform keeps the unrestricted viewport from
 *     index.html (WCAG 1.4.4).
 */
function applyIOSViewportGuard(): void {
  if (!isIOS()) return;
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content');
  if (!meta || !content || /maximum-scale/.test(content)) return;
  meta.setAttribute('content', `${content}, maximum-scale=1.0`);
}
