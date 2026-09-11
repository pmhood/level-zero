import {
  ActivityService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  LineageService,
  NotFoundError,
  SearchService,
  createProject,
  fixedClock,
  searchDocumentForEntity,
  sequentialIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEmbeddingProvider,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryProjectRepository,
  InMemorySearchDocumentRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { type AiCapability } from './capabilities';
import { ContextResolver } from './context-resolver';
import { BaseAiProvider, type AiRequest, type AiResult } from './provider';
import { ProviderAiCheckContext, CONSISTENCY_SCAN_ACTOR } from './provider-ai-check-context';
import { AiProviderRegistry } from './registry';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };
const vocabulary = ['oxygen', 'drain', 'air', 'supply', 'salvager'];

/** A text provider that answers with whatever the test set, and records the request. */
class StubTextProvider extends BaseAiProvider {
  readonly id = 'stub';
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'stub-1';
  readonly seen: AiRequest[] = [];

  constructor(private readonly answer: string) {
    super();
  }

  async execute(request: AiRequest): Promise<AiResult> {
    this.seen.push(request);
    return {
      capability: request.capability,
      providerId: this.id,
      model: this.defaultModel,
      requestId: 'provider-request-1',
      output: this.answer,
    };
  }
}

class FailingTextProvider extends BaseAiProvider {
  readonly id = 'failing';
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'failing-1';

  async execute(): Promise<AiResult> {
    throw new Error('anthropic is unreachable');
  }
}

let projects: InMemoryProjectRepository;
let entityRepo: InMemoryEntityRepository;
let generationRepo: InMemoryGenerationRepository;
let searchDocuments: InMemorySearchDocumentRepository;
let embeddings: InMemoryEmbeddingProvider;
let generations: GenerationService;
let contexts: ContextResolver;
let search: SearchService;
let providers: AiProviderRegistry;
let entities: EntityService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  projects = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  generationRepo = new InMemoryGenerationRepository();
  searchDocuments = new InMemorySearchDocumentRepository();
  embeddings = new InMemoryEmbeddingProvider(vocabulary);

  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const assetRepo = new InMemoryAssetRepository();
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projects, activity, deps);
  generations = new GenerationService(
    generationRepo,
    projects,
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
  contexts = new ContextResolver(projects, entityRepo, relationshipRepo, assetRepo, generationRepo);
  search = new SearchService(searchDocuments, embeddings);
  providers = new AiProviderRegistry();

  project = await projects.insert(createProject({ name: 'Deep Fathom' }, deps));
  otherProject = await projects.insert(createProject({ name: 'Sky Wreck' }, deps));
});

function context(projectId: string = project.id): ProviderAiCheckContext {
  return new ProviderAiCheckContext(projectId, { contexts, providers, generations, search });
}

/** Puts an entity in the index with a vector, the way a reindex would. */
async function index(entity: Entity): Promise<void> {
  const stored = await searchDocuments.upsert(searchDocumentForEntity(entity, deps));
  const [embedding] = await embeddings.embed([`${entity.name} ${entity.description ?? ''}`]);
  await searchDocuments.saveEmbedding(entity.projectId, stored.id, {
    embedding: embedding ?? [],
    model: embeddings.model,
    contentHash: stored.contentHash,
  });
}

describe('judge', () => {
  it('records the judgement as a completed text.generate generation with its context', async () => {
    const oxygen = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen drain' });
    providers.register(new StubTextProvider('{"findings":[]}'));

    const judgement = await context().judge({
      prompt: 'Decide whether these are the same concept.',
      contextEntityIds: [oxygen.id],
    });

    expect(judgement.output).toBe('{"findings":[]}');
    const generation = await generations.getById(project.id, judgement.generationId);
    expect(generation).toMatchObject({
      capability: 'text.generate',
      status: 'complete',
      provider: 'stub',
      model: 'stub-1',
      prompt: 'Decide whether these are the same concept.',
      contextEntityIds: [oxygen.id],
      providerRequestId: 'provider-request-1',
      createdBy: CONSISTENCY_SCAN_ACTOR,
      // The judgement's result is the finding, not a file (§9).
      outputAssetIds: [],
    });
  });

  it('keeps the assembled context on the record, so provenance can say what was read', async () => {
    const oxygen = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen drain',
      description: 'Oxygen drains while exploring.',
    });
    providers.register(new StubTextProvider('{"findings":[]}'));

    const judgement = await context().judge({ prompt: 'Decide.', contextEntityIds: [oxygen.id] });

    const { resolvedContext } = await generations.getById(project.id, judgement.generationId);
    expect(resolvedContext).toMatchObject({
      project: { id: project.id, name: 'Deep Fathom' },
      entities: [{ id: oxygen.id, name: 'Oxygen drain', source: 'selected' }],
    });
  });

  it('sends the context to the provider rather than only storing it', async () => {
    const oxygen = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen drain' });
    const provider = new StubTextProvider('{"findings":[]}');
    providers.register(provider);

    await context().judge({ prompt: 'Decide.', contextEntityIds: [oxygen.id] });

    expect(provider.seen[0]?.context?.entities.map((item) => item.id)).toEqual([oxygen.id]);
  });

  it('records the failure and re-throws when the provider does not answer', async () => {
    const oxygen = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen drain' });
    providers.register(new FailingTextProvider());

    await expect(
      context().judge({ prompt: 'Decide.', contextEntityIds: [oxygen.id] }),
    ).rejects.toThrow('anthropic is unreachable');

    const { items } = await generations.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      status: 'failed',
      failure: { message: 'anthropic is unreachable' },
    });
  });

  it('records the request even when no provider serves text.generate', async () => {
    const oxygen = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen drain' });

    await expect(
      context().judge({ prompt: 'Decide.', contextEntityIds: [oxygen.id] }),
    ).rejects.toThrow(NotFoundError);

    const { items } = await generations.listByProject(project.id);
    expect(items[0]).toMatchObject({ status: 'failed', provider: null });
  });

  it('refuses an entity from another project, because the context resolver does', async () => {
    const stranger = await entities.create(otherProject.id, {
      type: 'mechanic',
      name: 'Air supply',
    });
    providers.register(new StubTextProvider('{"findings":[]}'));

    await expect(
      context().judge({ prompt: 'Decide.', contextEntityIds: [stranger.id] }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('retrieve', () => {
  it('proposes the project entities closest to the text, without the one it came from', async () => {
    const oxygen = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen drain',
      description: 'oxygen drain',
    });
    const air = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Air supply',
      description: 'oxygen drain air supply',
    });
    await index(oxygen);
    await index(air);

    const candidates = await context().retrieve({
      text: 'oxygen drain',
      excludeEntityId: oxygen.id,
    });

    expect(candidates.map((candidate) => candidate.entityId)).toEqual([air.id]);
    expect(candidates[0]?.score).toBeGreaterThan(0);
  });

  it('never proposes another project material', async () => {
    const stranger = await entities.create(otherProject.id, {
      type: 'mechanic',
      name: 'Oxygen drain',
      description: 'oxygen drain',
    });
    await index(stranger);

    await expect(context().retrieve({ text: 'oxygen drain' })).resolves.toEqual([]);
  });

  it('returns at most the neighbours it was asked for', async () => {
    for (const name of ['Oxygen drain', 'Air supply', 'Oxygen bleed', 'Salvager oxygen']) {
      await index(
        await entities.create(project.id, {
          type: 'mechanic',
          name,
          description: 'oxygen drain air supply salvager',
        }),
      );
    }

    const candidates = await context().retrieve({ text: 'oxygen drain', limit: 2 });

    expect(candidates).toHaveLength(2);
  });
});
