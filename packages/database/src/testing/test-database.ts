import { join } from 'node:path';

import { loadDotEnv } from '@level-zero/config';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import { createDatabaseClient, type DatabaseClient } from '../postgres/client';
import { hasPostgresCode } from '../repositories/postgres-errors';
import { testRunId } from './test-run-id';

/** Postgres SQLSTATE for "a database with that name already exists". */
const DUPLICATE_DATABASE = '42P04';

const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');

/**
 * Connects to this checkout's own integration-test database, creating and
 * migrating it on first use.
 *
 * Tests run against real Postgres because the behaviour worth proving here —
 * project scoping, array and JSONB round trips, case-insensitive tag matching
 * — lives in SQL, not in TypeScript. A database per checkout (rather than the
 * one `pnpm db:migrate` prepares) is what lets `truncateDomainTables` empty
 * it between tests without also emptying another worktree's fixtures.
 */
export async function connectTestDatabase(): Promise<DatabaseClient> {
  loadDotEnv(__dirname);

  const adminConnectionString = process.env.DATABASE_URL;
  if (!adminConnectionString) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests need Postgres: run `pnpm infra:up`.',
    );
  }

  const databaseName = `level_zero_test_${testRunId()}`;
  await ensureDatabaseExists(adminConnectionString, databaseName);

  const client = createDatabaseClient({
    connectionString: withDatabaseName(adminConnectionString, databaseName),
    maxConnections: 4,
  });

  // Safe to run every time: drizzle's migrator tracks what it already applied
  // and no-ops once this checkout's database is up to date.
  await migrate(client.db, { migrationsFolder: MIGRATIONS_FOLDER });

  return client;
}

/** Empties the domain tables. `projects` cascades to `entities` and `assets`. */
export async function truncateDomainTables(client: DatabaseClient): Promise<void> {
  await client.db.execute(sql`truncate table projects restart identity cascade`);
}

/** Creates `databaseName` against the admin connection's database if it is missing. */
async function ensureDatabaseExists(
  adminConnectionString: string,
  databaseName: string,
): Promise<void> {
  const admin = new Client({ connectionString: adminConnectionString });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    // Another test file (or a prior run) already created it.
    if (!hasPostgresCode(error, DUPLICATE_DATABASE)) throw error;
  } finally {
    await admin.end();
  }
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
