import { beforeAll } from 'vitest';

beforeAll(() => {
  // Keep date formatting deterministic in tests.
  process.env.TZ = 'UTC';
});
