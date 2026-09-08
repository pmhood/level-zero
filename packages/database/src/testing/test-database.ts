import { loadDotEnv } from '@level-zero/config';
import { sql } from 'drizzle-orm';

import { createDatabaseClient, type DatabaseClient } from '../postgres/client';

/**
 * Connects to the development database for integration tests.
 *
 * Tests run against real Postgres because the behaviour worth proving here —
 * project scoping, array and JSONB round trips, case-insensitive tag matching —
 * lives in SQL, not in TypeScript.
 */
export function connectTestDatabase(): DatabaseClient {
  loadDotEnv(__dirname);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests need Postgres: run `pnpm infra:up` and `pnpm db:migrate`.',
    );
  }

  return createDatabaseClient({ connectionString, maxConnections: 4 });
}

/** Empties the domain tables. `projects` cascades to `entities`. */
export async function truncateDomainTables(client: DatabaseClient): Promise<void> {
  await client.db.execute(sql`truncate table projects restart identity cascade`);
}
