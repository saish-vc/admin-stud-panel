import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schema.js';

export type AppDb = NodePgDatabase<typeof schema>;
export type AppTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];
export type DbExecutor = AppDb | AppTransaction;

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'nttf-certificate-portal',
  });
}

export function createDb(client: Pool | PoolClient): AppDb {
  return drizzle(client, { schema });
}

export { schema };
