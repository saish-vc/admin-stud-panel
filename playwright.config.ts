import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for E2E tests. Copy .env.example to .env and configure it.',
  );
}

const API_PORT = 4100;
const WEB_PORT = 5174;
const baseURL = `http://127.0.0.1:${WEB_PORT}`;
const apiURL = `http://127.0.0.1:${API_PORT}`;

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/prepare-e2e.mjs && npm run dev:api',
      url: `${apiURL}/health/liveness`,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...inheritedEnv,
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl,
        PUBLIC_APP_URL: baseURL,
        WEB_ORIGIN: baseURL,
        LOG_LEVEL: 'warn',
        RATE_LIMIT_AUTH_MAX: '100',
        ENABLE_DOCS: 'false',
        STORAGE_LOCAL_DIR: './storage-e2e',
      },
    },
    {
      command: `npm run dev -w @nttf/web -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...inheritedEnv,
        VITE_API_TARGET: apiURL,
      },
    },
  ],
});
