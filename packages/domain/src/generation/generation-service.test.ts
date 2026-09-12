import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { AssetService } from '../asset/asset-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { ProjectService } from '../project/project-service';
import { EntityRelationshipService } from '../relationship/entity-relationship-service';
import { LineageService } from '../relationship/lineage-service';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '../testing';
import { GenerationService, type RecordGenerationInput } from './generation-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let projects: ProjectService;
let entities: EntityService;
let relationships: EntityRelationshipService;
let assets: AssetService;
let generations: GenerationService;
let activityRepo: InMemoryActivityRepository;
let project: Project;
let otherProject: Project;

const request = (overrides: Partial<RecordGenerationInput> = {}): RecordGenerationInput => ({
  capability: 'image.generate',
  prompt: 'a drowned cathedral lit from below',
  ...overrides,
});

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const assetRepo = new InMemoryAssetRepository();
  const generationRepo = new InMemoryGenerationRepository();
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  generations = new GenerationService(
    generationRepo,
    projectRepo,
    entityRepo,
    assetRepo,
    new LineageService(entities, relationships, activity),
    activity,
    deps,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

/** An image asset standing in for a provider output that has been stored. */
async function image(filename: string, projectId = project.id) {
  return assets.upload(projectId, {
    kind: 'image',
    filename,
    mimeType: 'image/png',
    content: Buffer.from(filename),
  });
}

describe('recording a generation', () => {
  it('records the request before any provider work, queued', async () => {
    const generation = await generations.record(project.id, request({ parameters: { steps: 30 } }));

    expect(generation).toMatchObject({
      projectId: project.id,
      capability: 'image.generate',
      prompt: 'a drowned cathedral lit from below',
      parameters: { steps: 30 },
      status: 'queued',
      provider: null,
      model: null,
    });
  });

  it('rejects inputs that belong to another project', async () => {
    const foreign = await entities.create(otherProject.id, { type: 'character', name: 'Kael' });

    await expect(
      generations.record(project.id, request({ inputEntityIds: [foreign.id] })),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects an input asset that does not exist', async () => {
    await expect(
      generations.record(project.id, request({ inputAssetIds: ['missing'] })),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses to record against an archived project', async () => {
    await projects.archive(project.id);

    await expect(generations.record(project.id, request())).rejects.toThrow(ConflictError);
  });
});

describe('a successful generation', () => {
  it('runs through queued, running and complete, keeping the request intact', async () => {
    const generation = await generations.record(project.id, request());

    const dispatched = await generations.dispatch(project.id, generation.id, {
      provider: 'openai',
      model: 'gpt-image-1',
      providerRequestId: 'req-9',
    });
    expect(dispatched).toMatchObject({ status: 'running', provider: 'openai' });

    const output = await image('cathedral.png');
    const completed = await generations.complete(project.id, generation.id, {
      outputAssetIds: [output.id],
      seed: '42',
    });

    expect(completed).toMatchObject({
      status: 'complete',
      prompt: generation.prompt,
      outputAssetIds: [output.id],
      seed: '42',
      providerRequestId: 'req-9',
    });
    expect(completed.completedAt).not.toBeNull();
  });

  it('records a generation_completed activity naming the output count', async () => {
    const generation = await generations.record(project.id, request());
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });
    const output = await image('cathedral.png');

    await generations.complete(project.id, generation.id, { outputAssetIds: [output.id] });

    const feed = await activityRepo.listByProject(project.id, {});
    expect(feed.items.find((item) => item.type === 'generation_completed')).toMatchObject({
      summary: 'Generation completed: 1 asset produced',
      subjectType: 'generation',
      subjectId: generation.id,
      metadata: { outputAssetIds: [output.id] },
    });
  });

  it('refuses to complete with an output asset from another project', async () => {
    const generation = await generations.record(project.id, request());
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });
    const foreign = await image('elsewhere.png', otherProject.id);

    await expect(
      generations.complete(project.id, generation.id, { outputAssetIds: [foreign.id] }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses to complete a generation that was never dispatched', async () => {
    const generation = await generations.record(project.id, request());

    await expect(
      generations.complete(project.id, generation.id, { outputAssetIds: [] }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('redispatch', () => {
  it('corrects the provider and model on an already-running generation', async () => {
    const generation = await generations.record(project.id, request());
    await generations.dispatch(project.id, generation.id, { provider: 'primary', model: 'p-1' });

    const redispatched = await generations.redispatch(project.id, generation.id, {
      provider: 'backup',
      model: 'b-1',
    });

    expect(redispatched).toMatchObject({ status: 'running', provider: 'backup', model: 'b-1' });
  });

  it('refuses to redispatch a generation that was never dispatched', async () => {
    const generation = await generations.record(project.id, request());

    await expect(
      generations.redispatch(project.id, generation.id, { provider: 'backup', model: 'b-1' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('generation failure', () => {
  it('keeps the diagnostics and the original request side by side', async () => {
    const generation = await generations.record(project.id, request({ parameters: { steps: 30 } }));
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });

    const failed = await generations.fail(project.id, generation.id, {
      code: 'timeout',
      message: 'Provider did not respond in 60s',
      details: { waitedSeconds: 60 },
    });

    expect(failed).toMatchObject({
      status: 'failed',
      prompt: generation.prompt,
      parameters: { steps: 30 },
      provider: 'echo',
      model: 'echo-1',
      failure: { code: 'timeout', details: { waitedSeconds: 60 } },
    });
  });

  it('records a generation_failed activity with a truncated summary', async () => {
    const generation = await generations.record(project.id, request());
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });

    await generations.fail(project.id, generation.id, {
      code: 'timeout',
      message: 'x'.repeat(2000),
    });

    const feed = await activityRepo.listByProject(project.id, {});
    const failure = feed.items.find((item) => item.type === 'generation_failed');

    expect(failure?.subjectId).toBe(generation.id);
    expect(failure?.summary.length).toBeLessThanOrEqual(300);
    expect(failure?.summary.startsWith('Generation failed: xxx')).toBe(true);
    expect(failure?.metadata).toMatchObject({ failureCode: 'timeout', attemptCount: 0 });
  });

  it('clears the provider and records every candidate tried once the capability is exhausted', async () => {
    const generation = await generations.record(project.id, request());
    await generations.dispatch(project.id, generation.id, {
      provider: 'openai',
      model: 'gpt-image-1',
    });

    const failed = await generations.fail(project.id, generation.id, {
      code: 'provider_error',
      message: '503 upstream unavailable',
      attempts: [
        { provider: 'openai', model: 'gpt-image-1', message: 'timeout' },
        { provider: 'anthropic', model: 'claude-1', message: '503 upstream unavailable' },
      ],
    });

    expect(failed).toMatchObject({
      status: 'failed',
      provider: null,
      model: null,
      attempts: [
        { provider: 'openai', model: 'gpt-image-1', message: 'timeout' },
        { provider: 'anthropic', model: 'claude-1', message: '503 upstream unavailable' },
      ],
    });

    const feed = await activityRepo.listByProject(project.id, {});
    const failure = feed.items.find((item) => item.type === 'generation_failed');
    expect(failure?.metadata).toMatchObject({ attemptCount: 2 });
  });

  it('can be retried as a child generation that points back at the failure', async () => {
    const first = await generations.record(project.id, request());
    await generations.fail(project.id, first.id, { message: 'No provider available' });

    const retry = await generations.record(project.id, request({ parentGenerationId: first.id }));

    expect(retry.parentGenerationId).toBe(first.id);
  });

  it('rejects a parent generation from another project', async () => {
    const foreign = await generations.record(otherProject.id, request());

    await expect(
      generations.record(project.id, request({ parentGenerationId: foreign.id })),
    ).rejects.toThrow(NotFoundError);
  });

  it('cancels a queued generation without recording a failure', async () => {
    const generation = await generations.record(project.id, request());

    await expect(generations.cancel(project.id, generation.id)).resolves.toMatchObject({
      status: 'cancelled',
      failure: null,
    });
  });
});

describe('lineage for generated outputs', () => {
  it('records generated_from edges from the output entity to the inputs and context', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const generation = await generations.record(
      project.id,
      request({ inputEntityIds: [reference.id], contextEntityIds: [pillar.id] }),
    );
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });

    const output = await image('cathedral.png');
    const outputEntity = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Cathedral concept',
      data: { assetId: output.id },
    });

    await generations.complete(project.id, generation.id, {
      outputAssetIds: [output.id],
      outputEntityIds: [outputEntity.id],
    });

    const neighborhood = await relationships.neighborhood(project.id, outputEntity.id);
    expect(neighborhood.outgoing.map((edge) => edge.relationship.relation)).toEqual([
      'generated_from',
      'generated_from',
    ]);
    expect(neighborhood.outgoing.map((edge) => edge.entity.id).sort()).toEqual(
      [reference.id, pillar.id].sort(),
    );
  });

  it('adds only the lineage that is new when the same entity is regenerated', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const outputEntity = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Cathedral concept',
    });

    for (const _round of [1, 2]) {
      const generation = await generations.record(
        project.id,
        request({ inputEntityIds: [reference.id] }),
      );
      await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });
      await generations.complete(project.id, generation.id, {
        outputAssetIds: [],
        outputEntityIds: [outputEntity.id],
      });
    }

    const neighborhood = await relationships.neighborhood(project.id, outputEntity.id);
    expect(neighborhood.outgoing).toHaveLength(1);
  });
});

describe('provenance', () => {
  it('explains a generated image in one call', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const inputAsset = await image('sketch.png');

    const first = await generations.record(project.id, request());
    await generations.fail(project.id, first.id, { message: 'timeout' });

    const generation = await generations.record(
      project.id,
      request({
        parameters: { steps: 30 },
        inputEntityIds: [reference.id],
        inputAssetIds: [inputAsset.id],
        contextEntityIds: [pillar.id],
        parentGenerationId: first.id,
      }),
    );
    await generations.dispatch(project.id, generation.id, {
      provider: 'openai',
      model: 'gpt-image-1',
    });
    const output = await image('cathedral.png');
    await generations.complete(project.id, generation.id, { outputAssetIds: [output.id] });

    const provenance = await generations.provenance(project.id, generation.id);

    expect(provenance.generation).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: generation.prompt,
      parameters: { steps: 30 },
    });
    expect(provenance.inputEntities.map((entity) => entity.id)).toEqual([reference.id]);
    expect(provenance.contextEntities.map((entity) => entity.id)).toEqual([pillar.id]);
    expect(provenance.inputAssets.map((asset) => asset.id)).toEqual([inputAsset.id]);
    expect(provenance.outputAssets.map((asset) => asset.id)).toEqual([output.id]);
    expect(provenance.parent?.id).toBe(first.id);
  });

  it('finds the generation behind an asset, and the generations an entity influenced', async () => {
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const generation = await generations.record(
      project.id,
      request({ contextEntityIds: [pillar.id] }),
    );
    await generations.dispatch(project.id, generation.id, { provider: 'echo', model: 'echo-1' });
    const output = await image('cathedral.png');
    await generations.complete(project.id, generation.id, { outputAssetIds: [output.id] });

    await expect(
      generations.listByProject(project.id, { outputAssetId: output.id }),
    ).resolves.toMatchObject({ total: 1, items: [{ id: generation.id }] });
    await expect(
      generations.listByProject(project.id, { entityId: pillar.id }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('never reads a generation through another project', async () => {
    const generation = await generations.record(project.id, request());

    await expect(generations.provenance(otherProject.id, generation.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});
