import { loadConfig, type AppConfig } from '../../src/config.js';

const ACCESS_SECRET = 'integration-test-access-secret-0123456789abcdef';
const REFRESH_SECRET = 'integration-test-refresh-secret-fedcba9876543210';

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    JWT_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL_DAYS: '7',
    BCRYPT_COST: '10',
    RATE_LIMIT_AUTH_MAX: '1000',
    RATE_LIMIT_WINDOW_MINUTES: '1',
    LOG_LEVEL: 'silent',
    ENABLE_DOCS: 'false',
    STORAGE_DRIVER: 'local',
    PUBLIC_APP_URL: 'http://localhost:5173',
    WEB_ORIGIN: 'http://localhost:5173',
  });

  return {
    ...config,
    // Cost 10 is the schema floor; override to keep fixture hashing fast.
    bcryptCost: 4,
    ...overrides,
  };
}
