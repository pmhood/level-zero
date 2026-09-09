import {
  AiProviderRegistry,
  AnthropicProvider,
  EchoAiProvider,
  LocalImageProvider,
} from '@level-zero/ai';
import { loadDotEnv, parseEnv, workerEnvSchema } from '@level-zero/config';
import {
  DrizzleAssetRepository,
  DrizzleEntityRelationshipRepository,
  DrizzleEntityRepository,
  DrizzleGenerationRepository,
  DrizzleJobRepository,
  DrizzleProjectRepository,
  checkPostgres,
  checkRedis,
  createDatabaseClient,
  createJobConsumer,
  createJobEvents,
  createJobQueue,
  createRedisClient,
} from '@level-zero/database';
import {
  AssetService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  JobService,
  LineageService,
  systemClock,
  uuidIdGenerator,
} from '@level-zero/domain';
import { LocalObjectStorageProvider } from '@level-zero/storage';

import { createGenerationJobHandler } from './generation-job';
import { createWorkerRuntime, type WorkerProbe } from './runtime';

async function main(): Promise<void> {
  loadDotEnv(__dirname);
  const env = parseEnv(workerEnvSchema, 'worker');

  // A worker needs far fewer connections than the API.
  const database = createDatabaseClient({ connectionString: env.DATABASE_URL, maxConnections: 2 });
  const redis = createRedisClient({
    connectionUrl: env.REDIS_URL,
    keyPrefix: 'level-zero:',
    // BullMQ requires unlimited retries on its blocking connections.
    maxRetriesPerRequest: null,
  });

  const deps = { clock: systemClock, ids: uuidIdGenerator };
  const projects = new DrizzleProjectRepository(database.db);
  const entities = new DrizzleEntityRepository(database.db);
  const relationships = new DrizzleEntityRelationshipRepository(database.db);
  const assets = new DrizzleAssetRepository(database.db);

  const entityService = new EntityService(entities, projects, deps);
  const lineage = new LineageService(
    entityService,
    new EntityRelationshipService(relationships, entities, deps),
  );

  const queue = createJobQueue({ connectionUrl: env.REDIS_URL });
  const events = createJobEvents({ connectionUrl: env.REDIS_URL });
  const jobs = new JobService(new DrizzleJobRepository(database.db), projects, queue, events, deps);
  const assetService = new AssetService(
    assets,
    projects,
    new LocalObjectStorageProvider({ rootDir: env.STORAGE_LOCAL_ROOT }),
    deps,
  );
  const generations = new GenerationService(
    new DrizzleGenerationRepository(database.db),
    projects,
    entities,
    assets,
    lineage,
    deps,
  );

  // Registration order is preference order, and a failing provider falls
  // through to the next candidate for the same capability.
  const providers = new AiProviderRegistry().register(new LocalImageProvider());
  if (env.ANTHROPIC_API_KEY) {
    providers.register(new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY }));
  } else {
    // Nothing hosted is configured: local development still runs end to end.
    providers.register(new EchoAiProvider(['text.generate']));
  }

  const probes: WorkerProbe[] = [
    { name: 'postgres', check: () => checkPostgres(database.db) },
    { name: 'redis', check: () => checkRedis(redis.redis) },
  ];

  const consumer = createJobConsumer({
    connectionUrl: env.REDIS_URL,
    handle: createGenerationJobHandler({
      jobs,
      generations,
      assets: assetService,
      providers,
      logger: console,
    }),
    onError: (error) => console.error('[worker] queue error', error),
  });

  const runtime = createWorkerRuntime({
    port: env.WORKER_PORT,
    probes,
    onShutdown: async () => {
      // Stop taking work first, so in-flight jobs finish before anything closes.
      await consumer.close();
      await Promise.all([queue.close(), events.close(), database.close(), redis.close()]);
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
