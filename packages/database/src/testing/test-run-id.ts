import { createHash } from 'node:crypto';

/**
 * A short id unique to this checkout and stable for the life of a test run.
 *
 * Concurrent `pnpm test` runs from different git worktrees share one Postgres
 * and Redis instance — `pnpm infra:up` starts them from the repository's
 * shared `infra/docker-compose.yml` project directory, not a per-worktree
 * one. This id scopes each worktree's integration-test database and BullMQ
 * keys to itself, so one worktree's tests cannot truncate, migrate over, or
 * receive queue deliveries meant for another's.
 *
 * Derived from where this file lives on disk: identical for every test
 * process reading it from one checkout, different for every other checkout.
 */
export function testRunId(): string {
  return createHash('sha1').update(__dirname).digest('hex').slice(0, 10);
}
