import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Read the version from package.json so the in-app status bar + Settings →
// About update automatically with each release. Avoids stale hardcoded
// "v0.1.0" labels drifting from reality.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf-8')).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Monii Watch',
        short_name: 'Monii',
        description: 'Envelope-method budgeting that syncs peer-to-peer.',
        theme_color: '#0e7490',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // v0.7.30 — exclude the WebLLM chunk from precache (it's
        // ~6 MB and only loads when the user opts into local-AI
        // statement parsing). Workbox's default 2 MB precache
        // ceiling rejects it otherwise; pushing the limit up just
        // to accommodate it would bloat the offline install
        // package for everyone, including users who never enable
        // the feature.
        globIgnores: ['**/web-llm*.js', '**/@mlc-ai*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor split: recharts is large; yjs+sync is hot but separable.
          recharts: ['recharts'],
          yjs: ['yjs', 'y-indexeddb', 'y-webrtc'],
          react: ['react', 'react-dom', 'react-router-dom'],
          // v0.7.30 — WebLLM gets its own named chunk so the PWA
          // service worker can exclude it from precache by filename
          // glob. ~6 MB compressed; only fetched if the user opts in
          // to local-AI statement parsing.
          'web-llm': ['@mlc-ai/web-llm'],
        },
      },
    },
    // Raise the chunk size warning threshold — we deliberately keep the main
    // chunk on the larger side because most users go straight to /budget.
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
  },
});
