import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from '../schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClientOptions {
  connectionString: string;
  /** Maximum pooled connections. Keep small for the worker. */
  maxConnections?: number;
  /** Fail fast instead of queueing forever when Postgres is unreachable. */
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  /** Logs every statement. Useful locally, noisy everywhere else. */
  logQueries?: boolean;
  ssl?: PoolConfig['ssl'];
}

export interface DatabaseClient {
  db: Database;
  pool: Pool;
  close(): Promise<void>;
}

/**
 * Creates a pooled Drizzle client. Callers own the lifetime and must call
 * `close()` on shutdown so the process can exit cleanly.
 */
export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
  });

  // Without a listener an idle-client error takes the whole process down.
  pool.on('error', (error) => {
    console.error('[database] idle client error', error);
  });

  const db = drizzle(pool, { schema, logger: options.logQueries ?? false });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
