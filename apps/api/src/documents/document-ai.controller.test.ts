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
  DocumentService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  GenerationService,
  LineageService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Document,
  type Entity,
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
import { DocumentAiController } from './document-ai.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

/** A provider whose answer — or failure — the test chooses. */
class ScriptedProvider extends BaseAiProvider {
  readonly capabilities: readonly AiCapability[] = ['text.rewrite'];
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
let documents: DocumentService;
let generations: GenerationService;
let entities: EntityService;
let providers: AiProviderRegistry;
let project: Project;
let answer: () => string | undefined;

function buildApp(registry: AiProviderRegistry) {
  return Test.createTestingModule({
    controllers: [DocumentAiController],
    providers: [
      { provide: DocumentService, useValue: documents },
      { provide: GenerationService, useValue: generations },
      { provide: ContextResolver, useValue: resolver },
      { provide: AI_PROVIDERS, useValue: registry },
      InlineAiRequestService,
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();
}

let resolver: ContextResolver;

async function startApp(registry: AiProviderRegistry): Promise<INestApplication> {
  const moduleRef = await buildApp(registry);
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
  const relationships = new InMemoryEntityRelationshipRepository();
  const assets = new InMemoryAssetRepository();
  const generationRepo = new InMemoryGenerationRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  const versions = new EntityVersionService(
    new InMemoryEntityVersionRepository(),
    entityRepo,
    activity,
    deps,
  );
  documents = new DocumentService(entities, versions, deps.ids);
  generations = new GenerationService(
    generationRepo,
    projects,
    entityRepo,
    assets,
    new LineageService(
      entities,
      new EntityRelationshipService(relationships, entityRepo, deps),
      activity,
    ),
    activity,
    deps,
  );
  resolver = new ContextResolver(projects, entityRepo, relationships, assets, generationRepo);

  answer = () => 'The diver holds their breath as the light fails.';
  providers = new AiProviderRegistry().register(new ScriptedProvider('scripted', () => answer()));

  app = await startApp(providers);

  project = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

const suggestionsUrl = (documentId: string, projectId = project.id) =>
  `/api/projects/${projectId}/documents/${documentId}/ai/suggestions`;

async function createDocument(): Promise<Document> {
  return documents.create(project.id, {
    name: 'Game Design Document',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core loop' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Explore, scavenge, upgrade, go deeper.' }],
        },
      ],
    },
  });
}

function createCharacter(): Promise<Entity> {
  return entities.create(project.id, {
    type: 'character',
    name: 'Kael Voss',
    description: 'A salvage diver who has been down too long.',
  });
}

const REWRITE = {
  action: 'rewrite',
  instruction: 'Rewrite the passage so it reads better.',
  selection: 'The diver holds their breath.',
};

describe('POST /projects/:projectId/documents/:documentId/ai/suggestions', () => {
  it('answers with the suggestion and the generation behind it', async () => {
    const document = await createDocument();

    const response = await http()
      .post(suggestionsUrl(document.entity.id))
      .send(REWRITE)
      .expect(201);

    expect(response.body.suggestion).toBe('The diver holds their breath as the light fails.');
    expect(response.body.generationId).toBeTruthy();
  });

  it('records the instruction, the passage and the project context as provenance', async () => {
    const document = await createDocument();
    const kael = await createCharacter();

    const response = await http()
      .post(suggestionsUrl(document.entity.id))
      .send({ ...REWRITE, mentionedEntityIds: [kael.id], createdBy: 'ada' })
      .expect(201);

    const generation: Generation = await generations.getById(
      project.id,
      response.body.generationId,
    );

    expect(generation.capability).toBe('text.rewrite');
    expect(generation.status).toBe('complete');
    expect(generation.provider).toBe('scripted');
    expect(generation.model).toBe('scripted-1');
    expect(generation.providerRequestId).toBe('req_scripted');
    expect(generation.prompt).toContain(REWRITE.instruction);
    expect(generation.prompt).toContain(REWRITE.selection);
    expect(generation.parameters).toEqual({ action: 'rewrite' });
    expect(generation.createdBy).toBe('ada');
    // The document being edited and the entity the passage mentions both went in.
    expect(generation.inputEntityIds).toEqual(
      expect.arrayContaining([document.entity.id, kael.id]),
    );
    expect(generation.resolvedContext).not.toBeNull();
    // Nothing was produced in the project: the writer has not accepted anything.
    expect(generation.outputAssetIds).toEqual([]);
  });

  it('sends the document itself as context, so the model reads what it is editing', async () => {
    const document = await createDocument();
    const provider = providers.list()[0] as ScriptedProvider;

    await http().post(suggestionsUrl(document.entity.id)).send(REWRITE).expect(201);

    const context = provider.lastRequest?.context;
    expect(context?.entities.map((entity) => entity.id)).toContain(document.entity.id);
    expect(JSON.stringify(context?.entities)).toContain('Explore, scavenge, upgrade, go deeper.');
  });

  it('tells the model to keep mention tokens intact', async () => {
    const document = await createDocument();
    const provider = providers.list()[0] as ScriptedProvider;

    await http()
      .post(suggestionsUrl(document.entity.id))
      .send({ ...REWRITE, selection: 'The diver @Kael Voss holds their breath.' })
      .expect(201);

    expect(provider.lastRequest?.prompt).toContain('Keep every @Name token exactly as it appears');
  });

  it('records a failure and answers 502 when the provider blows up', async () => {
    const document = await createDocument();
    answer = () => {
      throw new Error('the provider is on fire');
    };

    const response = await http()
      .post(suggestionsUrl(document.entity.id))
      .send(REWRITE)
      .expect(502);
    expect(response.body.message).toContain('the provider is on fire');

    const page = await generations.listByProject(project.id);
    expect(page.items[0]?.status).toBe('failed');
    expect(page.items[0]?.failure?.message).toContain('the provider is on fire');
    // Its one candidate never answered, so the record no longer names it.
    expect(page.items[0]?.provider).toBeNull();
    expect(page.items[0]?.attempts).toEqual([
      { provider: 'scripted', model: 'scripted-1', message: 'the provider is on fire' },
    ]);
  });

  it('treats an empty answer as a failed generation rather than an empty edit', async () => {
    const document = await createDocument();
    answer = () => '   ';

    await http().post(suggestionsUrl(document.entity.id)).send(REWRITE).expect(502);

    const page = await generations.listByProject(project.id);
    expect(page.items[0]?.status).toBe('failed');
  });

  it('refuses an entity that is not a document', async () => {
    const kael = await createCharacter();

    await http().post(suggestionsUrl(kael.id)).send(REWRITE).expect(400);
  });

  it('does not read a document from another project', async () => {
    const document = await createDocument();

    await http().post(suggestionsUrl(document.entity.id, 'prj_missing')).send(REWRITE).expect(404);
  });

  it('rejects a request with no instruction', async () => {
    const document = await createDocument();

    await http().post(suggestionsUrl(document.entity.id)).send({ action: 'rewrite' }).expect(400);
  });

  it('names the provider that actually answered after a failover', async () => {
    const document = await createDocument();
    const failing = new ScriptedProvider('failing', () => {
      throw new Error('nope');
    });
    const registry = new AiProviderRegistry()
      .register(failing)
      .register(new ScriptedProvider('standby', () => 'A steadier sentence.'));

    await app.close();
    app = await startApp(registry);

    const response = await http()
      .post(suggestionsUrl(document.entity.id))
      .send(REWRITE)
      .expect(201);

    expect(response.body.suggestion).toBe('A steadier sentence.');
    const generation = await generations.getById(project.id, response.body.generationId);
    expect(generation.provider).toBe('standby');
  });

  it('clears the provider and records every candidate tried once all of them fail', async () => {
    const document = await createDocument();
    const first = new ScriptedProvider('first', () => {
      throw new Error('first is down');
    });
    const second = new ScriptedProvider('second', () => {
      throw new Error('second is down');
    });
    const registry = new AiProviderRegistry().register(first).register(second);

    await app.close();
    app = await startApp(registry);

    const response = await http()
      .post(suggestionsUrl(document.entity.id))
      .send(REWRITE)
      .expect(502);
    expect(response.body.message).toContain('second is down');

    const page = await generations.listByProject(project.id);
    const generation = page.items[0];
    expect(generation?.status).toBe('failed');
    // Neither candidate produced the result, so the record no longer names
    // the first-choice one it was dispatched to.
    expect(generation?.provider).toBeNull();
    expect(generation?.model).toBeNull();
    expect(generation?.attempts).toEqual([
      { provider: 'first', model: 'scripted-1', message: 'first is down' },
      { provider: 'second', model: 'scripted-1', message: 'second is down' },
    ]);
  });
});
