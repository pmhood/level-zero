import {
  AssetService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  LineageService,
  NotFoundError,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type Asset,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleGenerationRepository } from './generation-repository';
import { DrizzleProjectRepository } from './project-repository';

/**
 * Drizzle wraps driver errors, so the Postgres SQLSTATE lives on the cause
 * chain rather than in the message.
 */
async function expectPostgresError(operation: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  const codes: string[] = [];
  for (let error = thrown; error instanceof Error; error = error.cause) {
    const candidate = (error as Error & { code?: string }).code;
    if (candidate) codes.push(candidate);
  }

  expect(thrown, 'expected the statement to be rejected').toBeInstanceOf(Error);
  expect(codes).toContain(code);
}

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let generationRepo: DrizzleGenerationRepository;
let projects: ProjectService;
let entities: EntityService;
let relationships: EntityRelationshipService;
let assets: AssetService;
let generations: GenerationService;
let project: Project;

beforeAll(() => {
  client = connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const relationshipRepo = new DrizzleEntityRelationshipRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  generationRepo = new DrizzleGenerationRepository(client.db);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  generations = new GenerationService(
    generationRepo,
    projectRepo,
    entityRepo,
    assetRepo,
    new LineageService(entities, relationships),
    deps,
  );
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
});

async function image(filename: string, projectId = project.id): Promise<Asset> {
  return assets.upload(projectId, {
    kind: 'image',
    filename,
    mimeType: 'image/png',
    content: Buffer.from(filename),
  });
}

describe('generation records', () => {
  it('round-trips a request with its parameters, inputs and project context', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const sketch = await image('sketch.png');

    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral lit from below',
      parameters: { steps: 30, aspectRatio: '16:9' },
      inputEntityIds: [reference.id],
      inputAssetIds: [sketch.id],
      contextEntityIds: [pillar.id],
      seed: '42',
      createdBy: 'pete',
    });

    await expect(generations.getById(project.id, created.id)).resolves.toMatchObject({
      projectId: project.id,
      capability: 'image.generate',
      prompt: 'a drowned cathedral lit from below',
      parameters: { steps: 30, aspectRatio: '16:9' },
      status: 'queued',
      provider: null,
      model: null,
      inputEntityIds: [reference.id],
      inputAssetIds: [sketch.id],
      contextEntityIds: [pillar.id],
      outputAssetIds: [],
      seed: '42',
      failure: null,
      completedAt: null,
      createdBy: 'pete',
    });
  });

  it('round-trips the assembled context, so provenance keeps its reasons', async () => {
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });

    const created = await generations.record(project.id, {
      capability: 'text.generate',
      prompt: 'name three drowned cathedrals',
      contextEntityIds: [pillar.id],
      resolvedContext: {
        project: { id: project.id, name: 'Deep Fathom', description: null },
        instruction: 'name three drowned cathedrals',
        entities: [{ id: pillar.id, source: 'related', distance: 1, relation: 'inspired_by' }],
        assets: [],
        lineage: null,
        truncated: false,
      },
    });

    await expect(generations.getById(project.id, created.id)).resolves.toMatchObject({
      resolvedContext: {
        entities: [{ id: pillar.id, source: 'related', relation: 'inspired_by' }],
        truncated: false,
      },
    });
  });

  it('leaves the context null for a caller that named its own inputs', async () => {
    const created = await generations.record(project.id, {
      capability: 'text.generate',
      prompt: 'name three drowned cathedrals',
    });

    await expect(generations.getById(project.id, created.id)).resolves.toMatchObject({
      resolvedContext: null,
    });
  });

  it('records the provider, model and outputs as the generation progresses', async () => {
    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
    await generations.dispatch(project.id, created.id, {
      provider: 'openai',
      model: 'gpt-image-1',
      providerRequestId: 'req-9',
    });
    const output = await image('cathedral.png');

    const completed = await generations.complete(project.id, created.id, {
      outputAssetIds: [output.id],
      seed: '7',
    });

    expect(completed).toMatchObject({
      status: 'complete',
      provider: 'openai',
      model: 'gpt-image-1',
      providerRequestId: 'req-9',
      outputAssetIds: [output.id],
      seed: '7',
    });
    expect(completed.startedAt).toBeInstanceOf(Date);
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it('keeps failure diagnostics alongside the request that produced them', async () => {
    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
      parameters: { steps: 30 },
    });

    const failed = await generations.fail(project.id, created.id, {
      code: 'content_filtered',
      message: 'Prompt was rejected by the provider',
      details: { httpStatus: 400, providerCode: 'moderation_blocked' },
    });

    await expect(generations.getById(project.id, failed.id)).resolves.toMatchObject({
      status: 'failed',
      prompt: 'a drowned cathedral',
      parameters: { steps: 30 },
      failure: {
        code: 'content_filtered',
        message: 'Prompt was rejected by the provider',
        details: { httpStatus: 400, providerCode: 'moderation_blocked' },
      },
    });
  });

  it('links a retry to the generation it re-rolls', async () => {
    const first = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
    await generations.fail(project.id, first.id, { message: 'timeout' });

    const retry = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral, wider shot',
      parentGenerationId: first.id,
    });

    await expect(
      generations.listByProject(project.id, { parentGenerationId: first.id }),
    ).resolves.toMatchObject({ total: 1, items: [{ id: retry.id }] });
  });
});

describe('database guarantees', () => {
  it('refuses a terminal status without a completion time', async () => {
    await expectPostgresError(
      client.db.execute(
        sql`insert into generations (id, project_id, capability, prompt, status)
            values (gen_random_uuid(), ${project.id}, 'image.generate', 'x', 'complete')`,
      ),
      '23514',
    );
  });

  it('refuses a failed generation with no diagnostics', async () => {
    await expectPostgresError(
      client.db.execute(
        sql`insert into generations (id, project_id, capability, prompt, status, completed_at)
            values (gen_random_uuid(), ${project.id}, 'image.generate', 'x', 'failed', now())`,
      ),
      '23514',
    );
  });

  it('refuses to delete a generation something was re-rolled from', async () => {
    const first = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
    await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'again',
      parentGenerationId: first.id,
    });

    await expectPostgresError(
      client.db.execute(sql`delete from generations where id = ${first.id}`),
      '23503',
    );
  });

  it('still allows a whole project to be removed', async () => {
    const first = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
    await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'again',
      parentGenerationId: first.id,
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select count(*)::int as count from generations`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });
});

describe('provenance lookups', () => {
  it('answers "how was this made" from the output asset alone', async () => {
    const pillar = await entities.create(project.id, {
      type: 'design_pillar',
      name: 'Oppressive scale',
    });
    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
      contextEntityIds: [pillar.id],
    });
    await generations.dispatch(project.id, created.id, { provider: 'echo', model: 'echo-1' });
    const output = await image('cathedral.png');
    await generations.complete(project.id, created.id, { outputAssetIds: [output.id] });

    const page = await generations.listByProject(project.id, { outputAssetId: output.id });
    expect(page.items.map((generation) => generation.id)).toEqual([created.id]);

    const provenance = await generations.provenance(project.id, page.items[0]!.id);
    expect(provenance).toMatchObject({
      generation: { provider: 'echo', model: 'echo-1', prompt: 'a drowned cathedral' },
      parent: null,
    });
    expect(provenance.contextEntities.map((entity) => entity.id)).toEqual([pillar.id]);
    expect(provenance.outputAssets.map((asset) => asset.id)).toEqual([output.id]);
  });

  it('finds the generations an entity influenced, as input or as context', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const asInput = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a',
      inputEntityIds: [reference.id],
    });
    const asContext = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'b',
      contextEntityIds: [reference.id],
    });
    await generations.record(project.id, { capability: 'image.generate', prompt: 'c' });

    const page = await generations.listByProject(project.id, { entityId: reference.id });
    expect(page.items.map((generation) => generation.id).sort()).toEqual(
      [asInput.id, asContext.id].sort(),
    );
  });

  it('writes generated_from lineage for an output entity', async () => {
    const reference = await entities.create(project.id, { type: 'idea', name: 'Sunken choir' });
    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
      inputEntityIds: [reference.id],
    });
    await generations.dispatch(project.id, created.id, { provider: 'echo', model: 'echo-1' });
    const output = await image('cathedral.png');
    const outputEntity = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Cathedral concept',
      data: { assetId: output.id },
    });

    await generations.complete(project.id, created.id, {
      outputAssetIds: [output.id],
      outputEntityIds: [outputEntity.id],
    });

    const neighborhood = await relationships.neighborhood(project.id, outputEntity.id);
    expect(
      neighborhood.outgoing.map((edge) => [edge.relationship.relation, edge.entity.id]),
    ).toEqual([['generated_from', reference.id]]);
  });
});

describe('project scoping', () => {
  it('never reads a generation through the wrong project', async () => {
    const other = await projects.create({ name: 'Sky Wreck' });
    const created = await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });

    await expect(generationRepo.findById(other.id, created.id)).resolves.toBeNull();
    await expect(generations.getById(other.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('never lists another project generations', async () => {
    const other = await projects.create({ name: 'Sky Wreck' });
    await generations.record(project.id, { capability: 'image.generate', prompt: 'mine' });

    await expect(generations.listByProject(other.id)).resolves.toMatchObject({ total: 0 });
  });
});
