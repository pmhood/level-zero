import { type Pool } from 'pg';

import { type DatabaseClient } from '../postgres/client';

/**
 * Counts the Postgres statements a callback issues, by wrapping the pool's
 * `query` method for the callback's duration.
 *
 * Drizzle's node-postgres driver sends every statement through the pool
 * passed to `drizzle(...)` (or a checked-out client inside a transaction),
 * so counting calls to `pool.query` counts round trips. Used to assert that
 * a read model's query count is fixed rather than growing with the number of
 * rows it returns — a harness every asset-library facet issue (#170, #200,
 * #201, #202) reuses rather than asserting this once and never again.
 */
export async function countQueries<T>(
  client: DatabaseClient,
  fn: () => Promise<T>,
): Promise<number> {
  const pool = client.pool as Pool & { query: Pool['query'] };
  const original = pool.query.bind(pool);
  let count = 0;

  pool.query = ((...args: Parameters<Pool['query']>) => {
    count += 1;
    return (original as (...callArgs: unknown[]) => unknown)(...args);
  }) as Pool['query'];

  try {
    await fn();
  } finally {
    pool.query = original;
  }

  return count;
}
