import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Small key/value table owned by the platform itself.
 *
 * It gives the bootstrap migration something real to create and gives the API's
 * readiness probe a table to read, which proves connectivity *and* that
 * migrations have been applied. Domain tables land in later issues.
 */
export const appMetadata = pgTable('app_metadata', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppMetadataRow = typeof appMetadata.$inferSelect;
export type NewAppMetadataRow = typeof appMetadata.$inferInsert;
