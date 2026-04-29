/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Build-time-injected app version (read from package.json by vite.config.ts
 * via `define`). Updates automatically every release — no more hardcoded
 * "v0.1.0" stale labels. See vite.config.ts → define.__APP_VERSION__.
 */
declare const __APP_VERSION__: string;
