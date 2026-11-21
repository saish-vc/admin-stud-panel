import { defineConfig } from 'drizzle-kit';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run Drizzle Kit');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },
  verbose: true,
  strict: true,
});
