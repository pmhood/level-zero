import { loadDotEnv, parseEnv, workerEnvSchema } from '@level-zero/config';
import {
  DrizzleActivityRepository,
  DrizzleAssetRepository,
  DrizzleJobRepository,
  DrizzleProjectRepository,
  createDatabaseClient,
  createJobEvents,
  createJobQueue,
} from '@level-zero/database';
import {
  ActivityService,
  AssetService,
  JobService,
  MAX_PAGE_SIZE,
  systemClock,
  uuidIdGenerator,
} from '@level-zero/domain';
import { LocalObjectStorageProvider } from '@level-zero/storage';

/**
 * Queues a thumbnail job for every existing source image asset that has none
 * yet — the one-off catch-up #176's acceptance criteria asks for, run once
 * per checkout rather than as part of `apps/worker`'s long-running process.
 *
 * `AssetService.backfillThumbnails` does the actual work, one project at a
 * time; this script only supplies the list of projects and the wiring to run
 * it against a real database and queue. Safe to run repeatedly: an asset that
 * already has a thumbnail is left alone, so a second run only picks up what
 * the first missed.
 */
async function main(): Promise<void> {
  loadDotEnv(__dirname);
  const env = parseEnv(workerEnvSchema, 'worker');

  const database = createDatabaseClient({ connectionString: env.DATABASE_URL, maxConnections: 2 });
  const queue = createJobQueue({ connectionUrl: env.REDIS_URL });
  const events = createJobEvents({ connectionUrl: env.REDIS_URL });

  const deps = { clock: systemClock, ids: uuidIdGenerator };
  const projects = new DrizzleProjectRepository(database.db);
  const jobs = new JobService(new DrizzleJobRepository(database.db), projects, queue, events, deps);
  const activity = new ActivityService(new DrizzleActivityRepository(database.db), deps);
  const assets = new AssetService(
    new DrizzleAssetRepository(database.db),
    projects,
    new LocalObjectStorageProvider({ rootDir: env.STORAGE_LOCAL_ROOT }),
    activity,
    deps,
    undefined,
    jobs,
  );

  try {
    let totalQueued = 0;
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const { items, total } = await projects.list({ limit: MAX_PAGE_SIZE, offset });

      for (const project of items) {
        const queued = await assets.backfillThumbnails(project.id);
        if (queued > 0) {
          console.log(`[backfill-thumbnails] queued ${queued} for project ${project.id}`);
        }
        totalQueued += queued;
      }

      if (offset + items.length >= total) break;
    }
    console.log(`[backfill-thumbnails] done - ${totalQueued} job(s) queued in total`);
  } finally {
    await Promise.all([queue.close(), events.close(), database.close()]);
  }
}

main().catch((error: unknown) => {
  console.error('[backfill-thumbnails] failed');
  console.error(error);
  process.exitCode = 1;
});
