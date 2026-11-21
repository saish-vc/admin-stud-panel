import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../../src/db/client.js';

/**
 * Applies every committed migration to the isolated test database before the
 * integration suite runs. The database name is guarded so a misconfigured
 * environment can never migrate or wipe the development database.
 */
export default async function globalSetup(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests.');
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to migrate non-test database "${database}".`);
  }

  const pool = createPool(url);
  try {
    const db = createDb(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), 'apps/api/drizzle'),
    });
  } finally {
    await pool.end();
  }
}
