import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cashbook',
        short_name: 'Cashbook',
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
