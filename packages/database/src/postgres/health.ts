import { sql } from 'drizzle-orm';

import { measureCheck, type DependencyCheckResult } from '../health';
import { type Database } from './client';

/** Number of migrations Drizzle has recorded as applied. */
export async function countAppliedMigrations(db: Database): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Readiness probe for Postgres.
 *
 * Reads `app_metadata`, which only exists once migrations have run, so an
 * un-migrated database reports `down` rather than a misleading `up`.
 */
export function checkPostgres(db: Database): Promise<DependencyCheckResult> {
  return measureCheck(async () => {
    await db.execute(sql`select 1 from app_metadata limit 1`);
    return { appliedMigrations: await countAppliedMigrations(db) };
  });
}
