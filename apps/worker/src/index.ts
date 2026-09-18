import {
  AiProviderRegistry,
  AnthropicProvider,
  ContextResolver,
  EchoAiProvider,
  LocalEmbeddingProvider,
  LocalImageProvider,
  ProviderAiCheckContext,
} from '@level-zero/ai';
import { loadDotEnv, parseEnv, workerEnvSchema } from '@level-zero/config';
import {
  DrizzleActivityRepository,
  DrizzleAssetRepository,
  DrizzleEntityRelationshipRepository,
  DrizzleEntityRepository,
  DrizzleFindingRepository,
  DrizzleGenerationRepository,
  DrizzleJobRepository,
  DrizzlePrototypeVersionRepository,
  DrizzleProjectRepository,
  DrizzleReviewDecisionRepository,
  DrizzleSearchDocumentRepository,
  checkPostgres,
  checkRedis,
  createDatabaseClient,
  createJobConsumer,
  createJobEvents,
  createJobQueue,
  createRedisClient,
  type JobDelivery,
  type JobHandler,
} from '@level-zero/database';
import {
  ActivityService,
  AssetService,
  ConsistencyScanService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  JobService,
  LineageService,
  SearchIndexService,
  SearchService,
  systemClock,
  uuidIdGenerator,
  type JobKind,
} from '@level-zero/domain';
import { LocalObjectStorageProvider } from '@level-zero/storage';

import { createConsistencyScanJobHandler } from './consistency-scan-job';
import { createGenerationJobHandler } from './generation-job';
import { createWorkerRuntime, type WorkerProbe } from './runtime';
import { createSearchIndexJobHandler } from './search-index-job';
import { createThumbnailJobHandler } from './thumbnail-job';

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
  const prototypeVersions = new DrizzlePrototypeVersionRepository(database.db);
  const reviewDecisions = new DrizzleReviewDecisionRepository(database.db);
  const findings = new DrizzleFindingRepository(database.db);

  const generationRepository = new DrizzleGenerationRepository(database.db);
  const activity = new ActivityService(new DrizzleActivityRepository(database.db), deps);

  const queue = createJobQueue({ connectionUrl: env.REDIS_URL });
  const events = createJobEvents({ connectionUrl: env.REDIS_URL });
  const jobs = new JobService(new DrizzleJobRepository(database.db), projects, queue, events, deps);

  // The API registers the same embedding provider, so a stored vector and the
  // query it is compared against are always in one vector space.
  const searchDocuments = new DrizzleSearchDocumentRepository(database.db);
  const embeddings = new LocalEmbeddingProvider();
  const search = new SearchIndexService(
    searchDocuments,
    entities,
    assets,
    generationRepository,
    embeddings,
    jobs,
    deps,
  );
  const consistency = new ConsistencyScanService(
    entities,
    prototypeVersions,
    reviewDecisions,
    findings,
    jobs,
    deps,
  );

  const entityService = new EntityService(entities, projects, activity, deps, search);
  const lineage = new LineageService(
    entityService,
    new EntityRelationshipService(relationships, entities, deps),
    activity,
  );
  const assetService = new AssetService(
    assets,
    projects,
    new LocalObjectStorageProvider({ rootDir: env.STORAGE_LOCAL_ROOT }),
    activity,
    deps,
    search,
    jobs,
  );
  const generations = new GenerationService(
    generationRepository,
    projects,
    entities,
    assets,
    lineage,
    activity,
    deps,
    search,
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

  // One resolver and one reader, shared by every scan; only the project
  // binding below is per job.
  const contexts = new ContextResolver(
    projects,
    entities,
    relationships,
    assets,
    generationRepository,
  );
  const searchReads = new SearchService(searchDocuments, embeddings);

  const probes: WorkerProbe[] = [
    { name: 'postgres', check: () => checkPostgres(database.db) },
    { name: 'redis', check: () => checkRedis(redis.redis) },
  ];

  // The queue names the kind it enqueued, so routing is a lookup rather than a
  // chain of checks inside one handler.
  const handlers: Record<JobKind, JobHandler> = {
    generation: createGenerationJobHandler({
      jobs,
      generations,
      assets: assetService,
      providers,
      logger: console,
    }),
    search_index: createSearchIndexJobHandler({ jobs, search, logger: console }),
    thumbnail: createThumbnailJobHandler({ jobs, assets: assetService, logger: console }),
    consistency_scan: createConsistencyScanJobHandler({
      jobs,
      consistency,
      // Bound to the project being scanned, so an AI check has no more reach
      // across projects than a deterministic one does.
      aiContext: (projectId) =>
        new ProviderAiCheckContext(projectId, {
          contexts,
          providers,
          generations,
          search: searchReads,
        }),
      logger: console,
    }),
  };

  const consumer = createJobConsumer({
    connectionUrl: env.REDIS_URL,
    handle: (delivery: JobDelivery) => handlers[delivery.kind](delivery),
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
