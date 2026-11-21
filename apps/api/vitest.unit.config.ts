import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
  root,
  test: {
    name: 'api-unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['./tests/setup/unit.ts'],
    testTimeout: 30_000,
  },
});
