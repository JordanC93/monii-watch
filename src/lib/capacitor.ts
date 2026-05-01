/**
 * Thin wrapper around Capacitor (Tier 9 #1) so the rest of the app can
 * call native APIs without taking a hard dependency on the bridge.
 *
 * In a browser PWA Capacitor isn't loaded → every helper here resolves
 * to a no-op. Inside the iOS / Android wrapper the bridge ships and
 * the helpers proxy through to it.
 *
 * IMPORTANT — we deliberately do NOT `import` the @capacitor/* packages
 * here. Even with `/* @vite-ignore *\/` Vite's dev import-analysis tries
 * to resolve dynamic-import specifiers, which would error on the web
 * build (where those packages aren't installed). Instead we read the
 * plugins from the `window.Capacitor.Plugins` registry the native shell
 * populates at boot. That registry is populated by the iOS / Android
 * Pod / Gradle integration — there's no bundler involvement.
 *
 * For the same reason we hand-roll a few enum values (ImpactStyle.Light,
 * StatusBar.Style.{Light,Dark}) instead of importing them — the native
 * bridge accepts plain strings.
 */

type CapBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => 'ios' | 'android' | 'web';
  Plugins?: Record<string, any>;
};

function getBridge(): CapBridge | null {
  if (typeof window === 'undefined') return null;
  // @ts-expect-error — runtime injection from the native shell
  const cap: CapBridge | undefined = window.Capacitor;
  return cap ?? null;
}

export function isCapacitor(): boolean {
  const cap = getBridge();
  return !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
}

export function getPlatform(): 'web' | 'ios' | 'android' {
  const cap = getBridge();
  if (!cap) return 'web';
  const p = cap.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

function getPlugin(name: string): any | null {
  const cap = getBridge();
  return cap?.Plugins?.[name] ?? null;
}

/**
 * Light haptic feedback — used on transaction-saved confirmations,
 * clear/uncleared toggles, etc. No-op on web.
 */
export async function hapticTap(): Promise<void> {
  if (!isCapacitor()) return;
  const Haptics = getPlugin('Haptics');
  if (!Haptics?.impact) return;
  try {
    await Haptics.impact({ style: 'LIGHT' });
  } catch {
    /* native call failed — silent */
  }
}

/**
 * Trigger the OS share sheet. Falls back to navigator.share when on web.
 * `text` is the body, `url` is optional.
 */
export async function share(opts: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (isCapacitor()) {
    const Share = getPlugin('Share');
    if (Share?.share) {
      try {
        await Share.share({ title: opts.title, text: opts.text, url: opts.url });
        return true;
      } catch {
        return false;
      }
    }
  }
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Tint the iOS status bar to match the current theme. Reads the same
 * colors the inline FOUC script uses for `<meta name="theme-color">`.
 * No-op on web + Android (which uses the meta tag automatically).
 */
export async function syncStatusBarToTheme(themeColor: string, isDarkText: boolean): Promise<void> {
  if (!isCapacitor()) return;
  if (getPlatform() !== 'ios') return;
  const StatusBar = getPlugin('StatusBar');
  if (!StatusBar) return;
  try {
    await StatusBar.setBackgroundColor?.({ color: themeColor });
    // The Capacitor StatusBar plugin uses string-valued styles:
    //   'LIGHT' = light content (white text) — for dark backgrounds
    //   'DARK'  = dark content  (black text) — for light backgrounds
    await StatusBar.setStyle?.({ style: isDarkText ? 'DARK' : 'LIGHT' });
  } catch {
    /* native call failed — silent */
  }
}

/**
 * Listener for the Android hardware back button. On iOS it's a no-op.
 * Returns an unsubscribe function. Use this where Esc would close a
 * modal in the desktop / web build.
 */
export function onHardwareBack(handler: () => void): () => void {
  if (!isCapacitor() || getPlatform() !== 'android') return () => {};
  const App = getPlugin('App');
  if (!App?.addListener) return () => {};
  let pendingUnlisten: (() => void) | null = null;
  let cancelled = false;
  (async () => {
    try {
      const sub = await App.addListener('backButton', handler);
      if (cancelled) sub?.remove?.();
      else pendingUnlisten = () => sub?.remove?.();
    } catch {
      /* native call failed */
    }
  })();
  return () => {
    cancelled = true;
    pendingUnlisten?.();
  };
}
