import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

loadDotenv({ path: path.resolve(process.cwd(), '.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for integration tests.');
}
if (!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('Integration tests refuse to run against a database not ending in _test.');
}
