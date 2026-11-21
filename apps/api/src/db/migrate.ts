import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { createDb, createPool } from './client.js';

// The same source runs via tsx (src/db) and from the bundled dist/migrate.js,
// so resolve the committed SQL folder from every supported layout.
function resolveMigrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    resolve(process.cwd(), 'apps/api/drizzle'),
    resolve(process.cwd(), 'drizzle'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle'),
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => resolve(candidate));

  return (
    candidates.find((candidate) => existsSync(join(candidate, 'meta', '_journal.json'))) ??
    candidates[0]!
  );
}

async function main() {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);
  const migrationsFolder = resolveMigrationsFolder();

  try {
    console.info('[db:migrate] applying migrations', { migrationsFolder });
    await migrate(db, { migrationsFolder });
    console.info('[db:migrate] complete');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db:migrate] failed', error);
  process.exitCode = 1;
});
