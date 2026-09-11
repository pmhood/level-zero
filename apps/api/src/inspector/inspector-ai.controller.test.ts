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
  GenerationService,
  LineageService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type Generation,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { AI_PROVIDERS } from '../infrastructure/ai.module';
import { InlineAiRequestService } from '../infrastructure/inline-ai-request.service';
import { InspectorAiController } from './inspector-ai.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

/** A text provider whose answer — or failure — the test chooses. */
class ScriptedProvider extends BaseAiProvider {
  readonly capabilities: readonly AiCapability[] = ['text.generate', 'text.rewrite'];
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
let relationships: EntityRelationshipService;
let lineage: LineageService;
let generations: GenerationService;
let resolver: ContextResolver;
let provider: ScriptedProvider;
let project: Project;
let otherProject: Project;
let answer: () => string | undefined;

async function startApp(registry: AiProviderRegistry): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [InspectorAiController],
    providers: [
      { provide: GenerationService, useValue: generations },
      { provide: EntityService, useValue: entities },
      { provide: LineageService, useValue: lineage },
      { provide: ContextResolver, useValue: resolver },
      { provide: AI_PROVIDERS, useValue: registry },
      InlineAiRequestService,
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  const instance = moduleRef.createNestApplication();
  instance.setGlobalPrefix('api');
  instance.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await instance.init();
  return instance;
}

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const assets = new InMemoryAssetRepository();
  const generationRepo = new InMemoryGenerationRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  lineage = new LineageService(entities, relationships, activity);
  generations = new GenerationService(
    generationRepo,
    projects,
    entityRepo,
    assets,
    lineage,
    activity,
    deps,
  );
  resolver = new ContextResolver(projects, entityRepo, relationshipRepo, assets, generationRepo);

  answer = () => 'Kael could be a scavenger who never dives, and trades what others bring up.';
  provider = new ScriptedProvider('scripted', () => answer());

  app = await startApp(new AiProviderRegistry().register(provider));

  project = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projects.insert(
    createProject({ name: 'Other Game' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

const actionsUrl = (projectId = project.id) => `/api/projects/${projectId}/ai/actions`;
const applyUrl = (generationId: string, projectId = project.id) =>
  `/api/projects/${projectId}/ai/actions/${generationId}/apply`;

const BRAINSTORM = {
  action: 'brainstorm-variants',
  capability: 'text.generate',
  instruction: 'Offer three variants of this character.',
};

function character(name = 'Kael Voss'): Promise<Entity> {
  return entities.create(project.id, {
    type: 'character',
    name,
    description: 'A salvage diver who has been down too long.',
  });
}

function mechanic(): Promise<Entity> {
  return entities.create(project.id, {
    type: 'mechanic',
    name: 'Oxygen management',
    description: 'Life is a resource.',
  });
}

describe('GET /projects/:projectId/ai/capabilities', () => {
  it('lists only the capabilities something can actually serve', async () => {
    const response = await http().get(`/api/projects/${project.id}/ai/capabilities`).expect(200);

    expect(response.body.capabilities).toEqual(['text.generate', 'text.rewrite']);
  });
});

describe('POST /projects/:projectId/ai/actions', () => {
  it('answers with the recommendation, the generation and the context behind it', async () => {
    const kael = await character();

    const response = await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(201);

    expect(response.body.output).toBe(answer());
    expect(response.body.action).toBe('brainstorm-variants');
    expect(response.body.capability).toBe('text.generate');
    expect(response.body.generationId).toBeTruthy();
    // The disclosure's material: the objects that went in, and why each did.
    expect(response.body.context.project.id).toBe(project.id);
    expect(response.body.context.entities).toEqual([
      expect.objectContaining({ id: kael.id, source: 'selected', distance: 0 }),
    ]);
  });

  it('records the ask, the resolved context and the provider that answered', async () => {
    const kael = await character();
    const oxygen = await mechanic();
    await relationships.link(project.id, {
      sourceEntityId: kael.id,
      targetEntityId: oxygen.id,
      relation: 'depends_on',
    });

    const response = await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id], createdBy: 'ada' })
      .expect(201);

    const generation: Generation = await generations.getById(
      project.id,
      response.body.generationId,
    );

    expect(generation.capability).toBe('text.generate');
    expect(generation.status).toBe('complete');
    expect(generation.provider).toBe('scripted');
    expect(generation.model).toBe('scripted-1');
    expect(generation.providerRequestId).toBe('req_scripted');
    expect(generation.prompt).toContain(BRAINSTORM.instruction);
    expect(generation.parameters).toEqual({ action: 'brainstorm-variants' });
    expect(generation.createdBy).toBe('ada');
    // What the user pointed at, and what the relationship walk brought in.
    expect(generation.inputEntityIds).toEqual([kael.id]);
    expect(generation.contextEntityIds).toEqual([oxygen.id]);
    expect(generation.resolvedContext).not.toBeNull();
    // Nothing was produced in the project: nobody has accepted anything.
    expect(generation.outputAssetIds).toEqual([]);
  });

  it('sends the subject and its neighbourhood to the provider as context', async () => {
    const kael = await character();
    const oxygen = await mechanic();
    await relationships.link(project.id, {
      sourceEntityId: kael.id,
      targetEntityId: oxygen.id,
      relation: 'depends_on',
    });

    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(201);

    expect(provider.lastRequest?.context?.entities.map((entity) => entity.name)).toEqual([
      'Kael Voss',
      'Oxygen management',
    ]);
  });

  it('asks about the subject alone when the walk is switched off', async () => {
    const kael = await character();
    const oxygen = await mechanic();
    await relationships.link(project.id, {
      sourceEntityId: kael.id,
      targetEntityId: oxygen.id,
      relation: 'depends_on',
    });

    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id], relatedDepth: 0 })
      .expect(201);

    expect(provider.lastRequest?.context?.entities.map((entity) => entity.id)).toEqual([kael.id]);
  });

  it('quotes workspace material the relationship graph does not hold', async () => {
    const prototype = await entities.create(project.id, {
      type: 'prototype',
      name: 'Dive loop',
    });

    await http()
      .post(actionsUrl())
      .send({
        action: 'explain-changes',
        capability: 'text.generate',
        instruction: 'Explain what changed between these versions.',
        selectedEntityIds: [prototype.id],
        excerpt: 'v2 · playable — retuned oxygen drain',
      })
      .expect(201);

    expect(provider.lastRequest?.prompt).toContain('v2 · playable — retuned oxygen drain');
  });

  it('resolves each request from its own subject, so a new selection leaks nothing', async () => {
    const kael = await character();
    const oxygen = await mechanic();

    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(201);

    const response = await http()
      .post(actionsUrl())
      .send({
        action: 'critique-rules',
        capability: 'text.generate',
        instruction: 'Critique these rules.',
        selectedEntityIds: [oxygen.id],
      })
      .expect(201);

    expect(response.body.context.entities.map((entity: { id: string }) => entity.id)).toEqual([
      oxygen.id,
    ]);
    expect(provider.lastRequest?.context?.entities.map((entity) => entity.id)).toEqual([oxygen.id]);
  });

  it('keeps retrieval project-scoped: another project is not addressable', async () => {
    const kael = await character();

    await http()
      .post(actionsUrl(otherProject.id))
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(404);
  });

  it('refuses an action whose capability nothing can serve, before recording anything', async () => {
    const kael = await character();

    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, capability: 'image.variation', selectedEntityIds: [kael.id] })
      .expect(404);

    const recorded = await generations.listByProject(project.id);
    expect(recorded.items).toEqual([]);
  });

  it('rejects a capability that is not a capability at all', async () => {
    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, capability: 'text.summarise' })
      .expect(400);
  });

  it('answers a project-level question with no subject at all', async () => {
    const response = await http()
      .post(actionsUrl())
      .send({
        action: 'ask',
        capability: 'text.generate',
        instruction: 'What is this game missing?',
      })
      .expect(201);

    expect(response.body.context.entities).toEqual([]);
    expect(response.body.context.project.name).toBe('Deep Fathom');
  });

  it('keeps the request and its diagnostics when the provider cannot answer', async () => {
    const kael = await character();
    answer = () => undefined;

    const response = await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(502);

    const [generation] = (await generations.listByProject(project.id)).items;
    expect(generation?.status).toBe('failed');
    expect(generation?.prompt).toContain(BRAINSTORM.instruction);
    expect(response.body.message).toContain('nothing');
  });

  it('leaves the subject exactly as it was: an answer is not a change', async () => {
    const kael = await character();

    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(201);

    expect(await entities.getById(project.id, kael.id)).toEqual(kael);
  });
});

describe('POST /projects/:projectId/ai/actions/:generationId/apply', () => {
  async function run(subject: Entity): Promise<string> {
    const response = await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [subject.id] })
      .expect(201);
    return response.body.generationId as string;
  }

  it('keeps an accepted recommendation as a draft idea linked to what it was about', async () => {
    const kael = await character();
    const generationId = await run(kael);

    const response = await http()
      .post(applyUrl(generationId))
      .send({ name: 'Kael variants', text: answer() as string, tags: ['ai'] })
      .expect(201);

    expect(response.body).toMatchObject({
      type: 'idea',
      name: 'Kael variants',
      description: answer(),
      status: 'draft',
      tags: ['ai'],
    });

    const lineageEdges = await relationships.listForEntity(project.id, response.body.id, {
      direction: 'outgoing',
    });
    expect(lineageEdges.items).toEqual([
      expect.objectContaining({
        targetEntityId: kael.id,
        relation: 'generated_from',
        metadata: { generationId },
      }),
    ]);
  });

  it('leaves the subject untouched: accepting adds, it never rewrites', async () => {
    const kael = await character();
    const generationId = await run(kael);

    await http()
      .post(applyUrl(generationId))
      .send({ name: 'Kael variants', text: answer() as string })
      .expect(201);

    expect(await entities.getById(project.id, kael.id)).toEqual(kael);
  });

  it('refuses a generation that never answered', async () => {
    const kael = await character();
    answer = () => undefined;
    await http()
      .post(actionsUrl())
      .send({ ...BRAINSTORM, selectedEntityIds: [kael.id] })
      .expect(502);
    const [generation] = (await generations.listByProject(project.id)).items;

    await http()
      .post(applyUrl(generation?.id ?? 'gen_missing'))
      .send({ name: 'Kael variants', text: 'anything' })
      .expect(409);

    expect((await entities.listByType(project.id, 'idea')).items).toEqual([]);
  });

  it('refuses a generation from another project', async () => {
    const kael = await character();
    const generationId = await run(kael);

    await http()
      .post(applyUrl(generationId, otherProject.id))
      .send({ name: 'Kael variants', text: answer() as string })
      .expect(404);
  });

  it('requires a name, so an accepted idea is something a list can show', async () => {
    const kael = await character();
    const generationId = await run(kael);

    await http()
      .post(applyUrl(generationId))
      .send({ text: answer() as string })
      .expect(400);
  });
});
