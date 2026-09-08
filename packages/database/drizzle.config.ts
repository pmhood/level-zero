import { defineConfig } from 'drizzle-kit';

/**
 * `pnpm db:generate` diffs `src/schema` against the SQL in `migrations/` and
 * writes a new migration file. Migrations are plain SQL and are applied by
 * `pnpm db:migrate`, never by `push`, so every environment runs the same steps.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://level_zero:level_zero@localhost:5432/level_zero',
  },
});
