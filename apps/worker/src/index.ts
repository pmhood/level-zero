import { loadDotEnv, parseEnv, workerEnvSchema } from '@level-zero/config';
import {
  checkPostgres,
  checkRedis,
  createDatabaseClient,
  createRedisClient,
} from '@level-zero/database';

import { createWorkerRuntime, type WorkerProbe } from './runtime';

async function main(): Promise<void> {
  loadDotEnv(__dirname);
  const env = parseEnv(workerEnvSchema, 'worker');

  // A worker needs far fewer connections than the API.
  const database = createDatabaseClient({ connectionString: env.DATABASE_URL, maxConnections: 2 });
  const redis = createRedisClient({
    connectionUrl: env.REDIS_URL,
    keyPrefix: 'level-zero:',
    // BullMQ (issue #7) requires unlimited retries on its blocking connections.
    maxRetriesPerRequest: null,
  });

  const probes: WorkerProbe[] = [
    { name: 'postgres', check: () => checkPostgres(database.db) },
    { name: 'redis', check: () => checkRedis(redis.redis) },
  ];

  const runtime = createWorkerRuntime({
    port: env.WORKER_PORT,
    probes,
    onShutdown: async () => {
      // Queue consumers registered in issue #7 are drained before this point.
      await Promise.all([database.close(), redis.close()]);
    },
  });

  await runtime.start();
  console.log(`[worker] ready (${env.NODE_ENV})`);

  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      console.log(`[worker] received ${signal}, shutting down`);
      runtime.stop().catch((error: unknown) => {
        console.error('[worker] shutdown failed', error);
        process.exitCode = 1;
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error('[worker] failed to start');
  console.error(error);
  process.exit(1);
});
