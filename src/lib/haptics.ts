/**
 * Lightweight haptic-feedback shim.
 *
 * - On iOS (Tauri 2 wrapped) — uses the haptics plugin when present.
 * - On Android (Tauri) — same path (haptics plugin supports both).
 * - On Safari iOS PWA — falls back to navigator.vibrate (limited but
 *   better than nothing).
 * - On desktop / browser — silent no-op (vibrate APIs are not honoured).
 *
 * Use the named helpers (`hapticTap`, `hapticSuccess`, …) so callers
 * don't have to know which platform they're on. Each helper picks the
 * right intensity/style.
 */

import { isTauri } from './device';

// Desktop here means "running in a Tauri webview on macOS / Windows / Linux".
// We treat it as no-op for haptics. The mobile Tauri builds are still
// `isTauri()===true`, so we narrow further with screen size as a heuristic.
function isDesktopApp(): boolean {
  if (!isTauri()) return false;
  // Crude but effective: phones/tablets typically have a max touch size.
  // Falls back to viewport as a safety net.
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) return true;
  return false;
}

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

async function impact(style: HapticStyle): Promise<void> {
  if (isDesktopApp()) return; // desktop: silent no-op
  // Try Tauri plugin first (iOS / Android wrapped builds).
  try {
    // The plugin isn't installed for the web bundle today; this is a
    // forward-looking import that's silently caught when missing.
    // @vite-ignore — the plugin path is constructed dynamically so Vite's
    // build doesn't try to resolve it at bundle time.
    const pluginName = '@tauri-apps/plugin-haptics';
    const mod = await (import(/* @vite-ignore */ pluginName).catch(() => null) as Promise<any>);
    if (mod && (mod as any).impactFeedback) {
      const map: Record<HapticStyle, string> = {
        light: 'light', medium: 'medium', heavy: 'heavy',
        success: 'success', warning: 'warning', error: 'error',
        selection: 'selection',
      };
      await (mod as any).impactFeedback({ style: map[style] ?? 'light' });
      return;
    }
  } catch {}
  // Browser fallback: navigator.vibrate.
  if ('vibrate' in navigator) {
    const dur: Record<HapticStyle, number | number[]> = {
      light: 8,
      medium: 15,
      heavy: 25,
      success: [10, 30, 10],
      warning: [20, 40, 20],
      error: [40, 60, 40, 60],
      selection: 5,
    };
    try { (navigator as any).vibrate(dur[style]); } catch {}
  }
}

export const haptics = {
  tap: () => impact('light'),
  selection: () => impact('selection'),
  medium: () => impact('medium'),
  success: () => impact('success'),
  warning: () => impact('warning'),
  error: () => impact('error'),
  // Power-user explicit access.
  impact,
};
