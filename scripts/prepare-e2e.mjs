import { execSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.test')],
  quiet: true,
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.error('TEST_DATABASE_URL is required. Copy .env.example to .env and configure it.');
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  RATE_LIMIT_AUTH_MAX: process.env.E2E_RATE_LIMIT_AUTH_MAX ?? '100',
  E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? 'NttfE2E!2026',
};

console.info('[prepare:e2e] applying migrations to the test database');
execSync('npm run db:migrate -w @nttf/api', { env, stdio: 'inherit' });

console.info('[prepare:e2e] loading deterministic E2E fixtures');
execSync('npm run db:seed:e2e -w @nttf/api', { env, stdio: 'inherit' });

console.info('[prepare:e2e] complete');
