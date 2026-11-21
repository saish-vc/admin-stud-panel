import { defineConfig } from 'vitest/config';

/**
 * The repository keeps the API unit, API integration, and web unit suites as
 * separate projects so CI can run them independently while `npm test` still
 * exercises the whole pyramid. Coverage is measured across the API source.
 */
export default defineConfig({
  test: {
    projects: [
      './apps/api/vitest.unit.config.ts',
      './apps/api/vitest.integration.config.ts',
      './apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['apps/api/src/**/*.ts'],
      exclude: [
        'apps/api/src/**/*.d.ts',
        'apps/api/src/server.ts',
        'apps/api/src/db/migrate.ts',
        'apps/api/src/types/**',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
        // Critical authorization and issuance paths carry a stricter gate.
        'apps/api/src/auth/**': {
          lines: 90,
          functions: 90,
          statements: 90,
        },
        'apps/api/src/services/**': {
          lines: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
