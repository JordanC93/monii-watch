import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration. Domain-only suite — pure functions over types,
 * no React, no Yjs, no IndexedDB. Keep it that way; integration tests
 * are not in scope for this repo.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src-tauri/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
