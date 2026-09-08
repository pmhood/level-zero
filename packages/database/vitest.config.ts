import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one Postgres database and truncate between
    // cases, so test files must not run concurrently against it.
    fileParallelism: false,
  },
});
