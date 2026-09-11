import {
  AiProviderRegistry,
  BaseAiProvider,
  ContextResolver,
  type AiCapability,
  type AiRequest,
  type AiResult,
} from '@level-zero/ai';
import {
  ActivityService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  GenerationService,
  LineageService,
  OutcomeComparisonService,
  PlaytestService,
  PrototypeService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Generation,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryGenerationRepository,
  InMemoryPlaytestRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { AI_PROVIDERS } from '../infrastructure/ai.module';
import { PrototypeOutcomesAiController } from './prototype-outcomes-ai.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

/** A provider whose answer — or failure — the test chooses. */
class ScriptedProvider extends BaseAiProvider {
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'scripted-1';
  lastRequest: AiRequest | null = null;

  constructor(
    readonly id: string,
    private readonly answer: () => string | undefined,
  ) {
    super();
  }

  async execute(request: AiRequest): Promise<AiResult> {
    this.lastRequest = request;
    return {
      capability: request.capability,
      providerId: this.id,
      model: this.defaultModel,
      requestId: `req_${this.id}`,
      output: this.answer(),
    };
  }
}

let app: INestApplication;
let entities: EntityService;
let versions: EntityVersionService;
let prototypes: PrototypeService;
let playtests: PlaytestService;
let generations: GenerationService;
let providers: AiProviderRegistry;
let project: Project;
let answer: () => string | undefined;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const assetRepo = new InMemoryAssetRepository();
  const generationRepo = new InMemoryGenerationRepository();
  const prototypeRepo = new InMemoryPrototypeVersionRepository();
  const playtestRepo = new InMemoryPlaytestRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  const relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  prototypes = new PrototypeService(
    prototypeRepo,
    entities,
    versionRepo,
    assetRepo,
    activity,
    relationships,
    deps,
  );
  playtests = new PlaytestService(playtestRepo, prototypeRepo, entities, activity, deps);
  generations = new GenerationService(
    generationRepo,
    projects,
    entityRepo,
    assetRepo,
    new LineageService(entities, relationships, activity),
    activity,
    deps,
  );

  answer = () => 'Session duration moved alongside the retuning; it is worth testing deliberately.';
  providers = new AiProviderRegistry().register(new ScriptedProvider('scripted', () => answer()));

  const moduleRef = await Test.createTestingModule({
    controllers: [PrototypeOutcomesAiController],
    providers: [
      {
        provide: OutcomeComparisonService,
        useValue: new OutcomeComparisonService(prototypes, playtestRepo),
      },
      { provide: GenerationService, useValue: generations },
      {
        provide: ContextResolver,
        useValue: new ContextResolver(
          projects,
          entityRepo,
          relationshipRepo,
          assetRepo,
          generationRepo,
        ),
      },
      { provide: AI_PROVIDERS, useValue: providers },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  project = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

/** A prototype captured twice, with the diver renamed in between. */
async function twoVersions() {
  const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
  await versions.commit(project.id, diver.id);

  const { prototype, version } = await prototypes.create(project.id, {
    prototypeName: 'Vertical slice',
    members: [{ entityId: diver.id }],
  });

  await entities.update(project.id, diver.id, { name: 'The Diver, rewritten' });
  await versions.commit(project.id, diver.id);
  const second = await prototypes.capture(project.id, prototype.id, {
    members: [{ entityId: diver.id }],
  });

  return { diverId: diver.id, prototypeId: prototype.id, from: version.id, to: second.id };
}

const interpretationUrl = (prototypeId: string, projectId = project.id) =>
  `/api/projects/${projectId}/prototypes/${prototypeId}/versions/outcomes/interpretation`;

describe('POST …/versions/outcomes/interpretation', () => {
  it('answers with the reading and the generation behind it', async () => {
    const { prototypeId, from, to } = await twoVersions();

    const response = await http()
      .post(interpretationUrl(prototypeId))
      .send({ from, to })
      .expect(201);

    expect(response.body.interpretation).toContain('worth testing');
    expect(response.body.generationId).toBeTruthy();
  });

  it('records the briefing, the context and the versions it read as provenance', async () => {
    const { diverId, prototypeId, from, to } = await twoVersions();
    const played = await playtests.create(project.id, {
      prototypeVersionId: from,
      name: 'First look',
    });
    await playtests.recordMetric(project.id, played.id, {
      label: 'Session duration',
      value: 120,
      unit: 's',
    });

    const response = await http()
      .post(interpretationUrl(prototypeId))
      .send({ from, to, createdBy: 'ada' })
      .expect(201);

    const generation: Generation = await generations.getById(
      project.id,
      response.body.generationId,
    );

    expect(generation.capability).toBe('text.generate');
    expect(generation.status).toBe('complete');
    expect(generation.provider).toBe('scripted');
    expect(generation.createdBy).toBe('ada');
    expect(generation.parameters).toEqual({
      fromPrototypeVersionId: from,
      toPrototypeVersionId: to,
    });
    // The prototype and the entity whose pin moved both entered context.
    expect(generation.inputEntityIds).toEqual(expect.arrayContaining([prototypeId, diverId]));
    expect(generation.resolvedContext).not.toBeNull();
    // The briefing carries the facts, and the rule that stops a causal claim.
    expect(generation.prompt).toContain('Session duration: 120 s → not measured');
    expect(generation.prompt).toContain('Never claim that a change caused an outcome');
    // Nothing was produced in the project: a reading is not project material.
    expect(generation.outputAssetIds).toEqual([]);
  });

  it('records a failure and answers 502 when the provider blows up', async () => {
    const { prototypeId, from, to } = await twoVersions();
    answer = () => {
      throw new Error('the provider is on fire');
    };

    const response = await http()
      .post(interpretationUrl(prototypeId))
      .send({ from, to })
      .expect(502);

    expect(response.body.message).toContain('the provider is on fire');

    const [recorded] = (await generations.listByProject(project.id, {})).items;
    expect(recorded).toMatchObject({ status: 'failed' });
    expect(recorded?.failure?.message).toContain('the provider is on fire');
  });

  it('records nothing when the two versions cannot be compared', async () => {
    const first = await twoVersions();
    const other = await twoVersions();

    await http()
      .post(interpretationUrl(first.prototypeId))
      .send({ from: first.from, to: other.to })
      .expect(400);

    expect((await generations.listByProject(project.id, {})).items).toEqual([]);
  });

  it('rejects a request that names no versions', async () => {
    const { prototypeId } = await twoVersions();

    await http().post(interpretationUrl(prototypeId)).send({}).expect(400);
  });
});
