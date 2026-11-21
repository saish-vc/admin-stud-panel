import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// Vitest 5 bundles Vite 7 while the web app uses Vite 8. Omitting the React
// plugin keeps the config type-safe; Vite's esbuild still applies the JSX
// transform from tsconfig during tests.
export default defineProject({
  root,
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  test: {
    name: 'web-unit',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
    restoreMocks: true,
  },
});
