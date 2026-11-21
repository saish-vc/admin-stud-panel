import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineProject } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(root, '../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for API integration tests. Copy .env.example to .env and configure it.',
  );
}
if (!new global.URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('Refusing to run integration tests against a database not ending in _test.');
}

export default defineProject({
  root,
  test: {
    name: 'api-integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup/integration.ts'],
    globalSetup: ['./tests/setup/global.ts'],
    // A single suite at a time keeps the shared test database deterministic.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      BCRYPT_COST: '10',
      RATE_LIMIT_AUTH_MAX: '1000',
      RATE_LIMIT_WINDOW_MINUTES: '1',
      LOG_LEVEL: 'silent',
      ENABLE_DOCS: 'false',
      STORAGE_DRIVER: 'local',
      PUBLIC_APP_URL: 'http://localhost:5173',
      WEB_ORIGIN: 'http://localhost:5173',
    },
  },
});
