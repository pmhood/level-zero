import {
  AiProviderRegistry,
  BaseAiProvider,
  EchoAiProvider,
  LocalImageProvider,
  type AiCapability,
  type AiRequest,
  type AiResult,
  type ResolvedContext,
} from '@level-zero/ai';
import { type JobDelivery } from '@level-zero/database';
import {
  ActivityService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  GENERATION_JOB_STEPS,
  GenerationService,
  JobService,
  LineageService,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Generation,
  type Job,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGenerationJobHandler } from './generation-job';

/** A provider that fails until it has been called `succeedOnAttempt` times. */
class FlakyProvider extends BaseAiProvider {
  readonly id = 'flaky';
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'flaky-1';
  calls = 0;

  constructor(private readonly succeedOnAttempt = Number.POSITIVE_INFINITY) {
    super();
  }

  async execute(request: AiRequest): Promise<AiResult> {
    this.calls += 1;
    if (this.calls < this.succeedOnAttempt) throw new Error('provider unavailable');
    return { capability: request.capability, providerId: this.id, model: this.defaultModel };
  }
}

/** A provider that always fails, for testing fallback to the next candidate. */
class FailingProvider extends BaseAiProvider {
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'failing-1';

  constructor(readonly id: string) {
    super();
  }

  async execute(): Promise<AiResult> {
    throw new Error(`${this.id} unavailable`);
  }
}

const silentLogger = { log: () => {}, error: () => {} };

let jobs: JobService;
let generations: GenerationService;
let entities: EntityService;
let assets: AssetService;
let providers: AiProviderRegistry;
let project: Project;

beforeEach(async () => {
  const deps = { clock: systemClock, ids: uuidIdGenerator };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const assetRepo = new InMemoryAssetRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  generations = new GenerationService(
    new InMemoryGenerationRepository(),
    projectRepo,
    entityRepo,
    assetRepo,
    new LineageService(
      entities,
      new EntityRelationshipService(relationshipRepo, entityRepo, deps),
      activity,
    ),
    activity,
    deps,
  );
  providers = new AiProviderRegistry();

  project = await projectRepo.insert(createProject({ name: 'Deep Fathom' }, deps));
});

/** Records a generation and queues it, the state the API leaves behind. */
async function queued(
  input: {
    capability?: string;
    prompt?: string;
    parameters?: Record<string, unknown>;
    inputEntityIds?: string[];
    resolvedContext?: Record<string, unknown>;
  } = {},
): Promise<{ generation: Generation; job: Job }> {
  const generation = await generations.record(project.id, {
    capability: input.capability ?? 'text.generate',
    prompt: input.prompt ?? 'name three drowned cathedrals',
    parameters: input.parameters,
    inputEntityIds: input.inputEntityIds,
    resolvedContext: input.resolvedContext,
  });
  const job = await jobs.enqueue(project.id, {
    kind: 'generation',
    targetId: generation.id,
    totalSteps: GENERATION_JOB_STEPS.length,
  });

  return { generation, job };
}

function delivery(job: Job, overrides: Partial<JobDelivery> = {}): JobDelivery {
  return {
    jobId: job.id,
    projectId: job.projectId,
    kind: 'generation',
    attempt: 1,
    willRetry: false,
    ...overrides,
  };
}

const handle = () =>
  createGenerationJobHandler({ jobs, generations, assets, providers, logger: silentLogger });

describe('running a generation job', () => {
  beforeEach(() => {
    providers.register(new EchoAiProvider(['text.generate']));
  });

  it('completes the job and the generation record it was queued for', async () => {
    const { generation, job } = await queued();

    await handle()(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'complete',
      progress: { completed: 3, total: 3, step: null },
    });
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'complete',
      provider: 'echo',
      model: 'echo-1',
    });
  });

  it('uses the model the request named over the provider default', async () => {
    const { generation, job } = await queued({ parameters: { model: 'echo-preview' } });

    await handle()(delivery(job));

    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      model: 'echo-preview',
    });
  });

  it('does nothing for a job that was cancelled before it was picked up', async () => {
    const { generation, job } = await queued();
    await jobs.cancel(project.id, job.id);

    await handle()(delivery(job));

    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'queued',
    });
  });

  it('fails the job when no provider serves the capability', async () => {
    const generation = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
    const job = await jobs.enqueue(project.id, {
      kind: 'generation',
      targetId: generation.id,
      totalSteps: GENERATION_JOB_STEPS.length,
    });

    await expect(handle()(delivery(job))).rejects.toThrow();

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('cancelling work in flight', () => {
  it('stops at the next step and leaves the queue alone', async () => {
    const { generation, job } = await queued();
    // A provider call is where a cancellation lands in practice.
    providers.register(
      new (class extends BaseAiProvider {
        readonly id = 'slow';
        readonly capabilities: readonly AiCapability[] = ['text.generate'];
        readonly defaultModel = 'slow-1';
        async execute(request: AiRequest): Promise<AiResult> {
          await generations.cancel(project.id, generation.id);
          await jobs.cancel(project.id, job.id);
          return { capability: request.capability, providerId: this.id, model: this.defaultModel };
        }
      })(),
    );

    // Resolves rather than throwing: a cancelled job must not be retried.
    await expect(handle()(delivery(job))).resolves.toBeUndefined();

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'cancelled',
      progress: { completed: 1, total: 3 },
    });
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });
});

describe('failure and retry', () => {
  it('sends the job back to the queue and leaves the generation running', async () => {
    providers.register(new FlakyProvider());
    const { generation, job } = await queued();

    await expect(handle()(delivery(job, { willRetry: true }))).rejects.toThrow(
      'provider unavailable',
    );

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'queued',
      attempt: 2,
      failure: { code: 'provider_error', message: 'provider unavailable' },
    });
    // Still running: the next attempt continues this generation, not a new one.
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'running',
    });
  });

  it('finishes a generation the second attempt gets through', async () => {
    const provider = new FlakyProvider(2);
    providers.register(provider);
    const { generation, job } = await queued();

    await expect(handle()(delivery(job, { willRetry: true }))).rejects.toThrow();
    await handle()(delivery(job, { attempt: 2, willRetry: false }));

    expect(provider.calls).toBe(2);
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'complete' });
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'complete',
    });
  });

  it('fails both records once the queue is out of attempts', async () => {
    providers.register(new FlakyProvider());
    const { generation, job } = await queued();

    await expect(handle()(delivery(job, { attempt: 3, willRetry: false }))).rejects.toThrow();

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'failed' });
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'provider_error', message: 'provider unavailable' },
    });
  });
});

describe('provider fallback', () => {
  it('completes with the next registered candidate when the first-choice provider throws', async () => {
    providers
      .register(new FailingProvider('primary'))
      .register(new EchoAiProvider(['text.generate'], 'backup'));
    const { generation, job } = await queued();

    await handle()(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'complete' });
    // Names the provider and model that actually produced the result, not the
    // first-choice one recorded when the attempt started.
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'complete',
      provider: 'backup',
      model: 'echo-1',
    });
  });

  it('fails the generation with the last candidate error once every candidate is exhausted', async () => {
    providers.register(new FailingProvider('primary')).register(new FailingProvider('secondary'));
    const { generation, job } = await queued();

    await expect(handle()(delivery(job))).rejects.toThrow('secondary unavailable');

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'failed' });
    await expect(generations.getById(project.id, generation.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { message: 'secondary unavailable' },
    });
  });
});

describe('context', () => {
  it('hands the provider the context resolved when the request was recorded', async () => {
    let seen: AiRequest | undefined;
    providers.register(
      new (class extends BaseAiProvider {
        readonly id = 'recording';
        readonly capabilities: readonly AiCapability[] = ['text.generate'];
        readonly defaultModel = 'recording-1';
        async execute(request: AiRequest): Promise<AiResult> {
          seen = request;
          return { capability: request.capability, providerId: this.id, model: this.defaultModel };
        }
      })(),
    );
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const resolvedContext = {
      project: { id: project.id, name: project.name, description: null },
      instruction: 'name three drowned cathedrals',
      entities: [
        {
          id: pillar.id,
          type: 'design_pillar',
          name: 'Oppressive scale',
          description: null,
          status: 'draft',
          tags: [],
          source: 'selected',
          distance: 0,
          relation: null,
          viaEntityId: null,
        },
      ],
      assets: [],
      lineage: null,
      truncated: false,
    } satisfies ResolvedContext as unknown as Record<string, unknown>;
    const { job } = await queued({ inputEntityIds: [pillar.id], resolvedContext });

    await handle()(delivery(job));

    expect(seen?.context?.entities).toMatchObject([{ id: pillar.id, source: 'selected' }]);
  });

  it('leaves the context undefined when the request resolved none', async () => {
    let seen: AiRequest | undefined;
    providers.register(
      new (class extends BaseAiProvider {
        readonly id = 'recording';
        readonly capabilities: readonly AiCapability[] = ['text.generate'];
        readonly defaultModel = 'recording-1';
        async execute(request: AiRequest): Promise<AiResult> {
          seen = request;
          return { capability: request.capability, providerId: this.id, model: this.defaultModel };
        }
      })(),
    );
    const { job } = await queued();

    await handle()(delivery(job));

    expect(seen?.context).toBeUndefined();
  });
});

describe('storing what a provider produced', () => {
  it('keeps text output as a project asset the generation points at', async () => {
    providers.register(new EchoAiProvider(['text.generate']));
    const { generation, job } = await queued({ prompt: 'name three drowned cathedrals' });

    await handle()(delivery(job));

    const { outputAssetIds } = await generations.getById(project.id, generation.id);
    expect(outputAssetIds).toHaveLength(1);

    const stored = await assets.download(project.id, outputAssetIds[0] as string);
    expect(stored.asset.mimeType).toBe('text/plain');
    expect(stored.content.toString('utf8')).toBe('name three drowned cathedrals');
  });

  it('stores generated image bytes the same way', async () => {
    providers.register(new LocalImageProvider());
    const { generation, job } = await queued({
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });

    await handle()(delivery(job));

    const record = await generations.getById(project.id, generation.id);
    expect(record).toMatchObject({ status: 'complete', provider: 'local-image' });

    const stored = await assets.download(project.id, record.outputAssetIds[0] as string);
    expect(stored.asset).toMatchObject({ kind: 'image', mimeType: 'image/svg+xml' });
    expect(stored.content.toString('utf8')).toContain('<svg');
  });
});
