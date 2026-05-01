/**
 * Capacitor configuration (Tier 9 #1).
 *
 * This wraps the existing Vite build (./dist) into a native iOS / Android
 * shell. The same React + Yjs codebase ships everywhere — Capacitor only
 * provides the WKWebView / Chrome Custom Tab host plus a small bridge
 * for native APIs (status bar, haptics, share sheet).
 *
 * Why Capacitor in addition to Tauri?
 *   - Tauri's iOS / Android targets exist but the build pipeline is rough
 *     and Apple's review process pushes back on some patterns.
 *   - Capacitor's the most-shipped Cordova-successor; App Store + Play
 *     Store distribution is well-trodden ground.
 *   - The maintainer's primary friction was iOS — Tauri-iOS was tried
 *     earlier and shelved. Capacitor's the production path.
 *
 * Both wrappers stay alive in the repo:
 *   - Tauri  → desktop installers (Mac / Windows / Linux) via CI.
 *   - Capacitor → iOS App Store / TestFlight + Google Play.
 *   - PWA    → browser install + Firefox users.
 *
 * The web bundle is identical across all three. Native-only features
 * (status bar tinting, share sheet, haptics) are accessed through
 * `src/lib/capacitor.ts`, which gracefully degrades to no-ops when the
 * bridge isn't present (so the same code paths work in plain browsers).
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moniiwatch.app',
  appName: 'Monii Watch',
  webDir: 'dist',
  // Allow file:// + IndexedDB to work the same as on web.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  ios: {
    // iOS WKWebView writes its IndexedDB into the app's Library/WebKit
    // folder. iCloud backup picks it up automatically — for users who
    // wipe the app or get a new device, their budget rides along with
    // their iCloud backup unless they opt out at the OS level.
    contentInset: 'automatic',
    backgroundColor: '#0b1020',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    // The Android shell is included for parity but not the primary
    // target (the maintainer is on iOS). PWA install on Chrome /
    // Edge handles most Android use-cases.
    backgroundColor: '#0b1020',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0b1020',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
