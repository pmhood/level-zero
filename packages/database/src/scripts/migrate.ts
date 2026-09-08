import { join } from 'node:path';

import { loadDotEnv, parseEnv, sharedEnvSchema } from '@level-zero/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabaseClient } from '../postgres/client';
import { countAppliedMigrations } from '../postgres/health';

/**
 * Applies every pending migration and exits.
 *
 * Safe to run repeatedly and from a completely empty database, which is what
 * both local setup and CI do.
 */
async function main(): Promise<void> {
  loadDotEnv(__dirname);
  const env = parseEnv(sharedEnvSchema, 'database migrations');

  const client = createDatabaseClient({
    connectionString: env.DATABASE_URL,
    maxConnections: 1,
  });

  const migrationsFolder = join(__dirname, '..', '..', 'migrations');
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);

  try {
    await migrate(client.db, { migrationsFolder });
    const applied = await countAppliedMigrations(client.db);
    console.log(`[migrate] done - ${applied} migration(s) applied in total`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error('[migrate] failed');
  console.error(error);
  process.exitCode = 1;
});
