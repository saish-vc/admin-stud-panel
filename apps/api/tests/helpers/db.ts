import type { Pool } from 'pg';
import { createDb } from '../../src/db/client.js';
import type { AppDb } from '../../src/db/client.js';

const ROLLBACK = Symbol('test-rollback');

/**
 * Runs a test inside one real PostgreSQL transaction and always rolls it back.
 *
 * Drizzle nests `tx.transaction()` calls as SAVEPOINTs, so service-level
 * transactions behave exactly as they do in production while the outer
 * transaction keeps the shared test database clean between tests.
 */
export async function withTestTransaction<T>(
  pool: Pool,
  callback: (db: AppDb) => Promise<T>,
): Promise<T> {
  const db = createDb(pool);
  try {
    return await db.transaction(async (tx) => {
      const result = await callback(tx as unknown as AppDb);
      throw { [ROLLBACK]: true, result };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && ROLLBACK in error) {
      return (error as unknown as { result: T }).result;
    }
    throw error;
  }
}
