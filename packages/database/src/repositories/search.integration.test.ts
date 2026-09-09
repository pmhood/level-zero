import {
  ActivityService,
  EntityService,
  ProjectService,
  SearchService,
  searchDocumentForEntity,
  systemClock,
  uuidIdGenerator,
  type Entity,
  type Project,
  type SearchDocument,
} from '@level-zero/domain';
import { InMemoryEmbeddingProvider } from '@level-zero/domain/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzleSearchDocumentRepository } from './search-document-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

/** The vector space these tests reason in: dimensions a reader can name. */
const VOCABULARY = ['oxygen', 'dive', 'trench', 'forest', 'canopy'];

let client: DatabaseClient;
let documents: DrizzleSearchDocumentRepository;
let projects: ProjectService;
let entities: EntityService;
let embeddings: InMemoryEmbeddingProvider;
let search: SearchService;
let project: Project;
let otherProject: Project;

beforeAll(() => {
  client = connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);

  documents = new DrizzleSearchDocumentRepository(client.db);
  embeddings = new InMemoryEmbeddingProvider(VOCABULARY);
  projects = new ProjectService(projectRepo, deps);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  search = new SearchService(documents, embeddings);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
});

async function index(entity: Entity): Promise<SearchDocument> {
  return documents.upsert(searchDocumentForEntity(entity, deps));
}

/** Indexes an entity and gives it a vector, the way the index job would. */
async function indexWithEmbedding(entity: Entity, text: string): Promise<SearchDocument> {
  const document = await index(entity);
  const [embedding] = await embeddings.embed([text]);

  await documents.saveEmbedding(document.projectId, document.id, {
    embedding: embedding ?? [],
    model: embeddings.model,
    contentHash: document.contentHash,
  });
  return document;
}

describe('keyword search', () => {
  it('matches on the words in the body, and ranks a title match above it', async () => {
    const named = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      description: 'The diver surfaces before the meter empties.',
    });
    const mentioned = await entities.create(project.id, {
      type: 'location',
      name: 'The Trench',
      description: 'Reaching the floor costs most of a tank of oxygen.',
    });
    await index(named);
    await index(mentioned);

    const { items, total } = await search.search(project.id, { text: 'oxygen' });

    expect(total).toBe(2);
    expect(items.map((item) => item.title)).toEqual(['Oxygen Drain', 'The Trench']);
    expect(items[0]?.score).toBeGreaterThan(items[1]?.score ?? 1);
  });

  it('matches a word the text spells differently, because Postgres stems both', async () => {
    await index(
      await entities.create(project.id, {
        type: 'mechanic',
        name: 'Exploration budget',
        description: 'Each dive spends part of it.',
      }),
    );

    await expect(search.search(project.id, { text: 'exploring' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('returns a preview rather than the whole indexed body', async () => {
    await index(
      await entities.create(project.id, {
        type: 'idea',
        name: 'Oxygen tether',
        description: 'x'.repeat(1000),
      }),
    );

    const { items } = await search.search(project.id, { text: 'oxygen' });

    expect(items[0]?.excerpt.length).toBeLessThanOrEqual(240);
  });

  it('browses the newest material when no words are given', async () => {
    await index(await entities.create(project.id, { type: 'idea', name: 'Oxygen tether' }));
    await index(await entities.create(project.id, { type: 'idea', name: 'Trench beacon' }));

    const { items } = await search.search(project.id, {});

    expect(items).toHaveLength(2);
  });
});

describe('project isolation', () => {
  it('never returns another project’s material to a keyword search', async () => {
    await index(await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' }));
    await index(await entities.create(otherProject.id, { type: 'mechanic', name: 'Oxygen Bloom' }));

    const mine = await search.search(project.id, { text: 'oxygen' });

    expect(mine.total).toBe(1);
    expect(mine.items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });

  it('never returns another project’s material to a semantic query', async () => {
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' }),
      'oxygen dive',
    );
    await indexWithEmbedding(
      await entities.create(otherProject.id, { type: 'mechanic', name: 'Oxygen Bloom' }),
      'oxygen dive',
    );

    const mine = await search.searchSemantic(project.id, { text: 'oxygen dive' });

    expect(mine.items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });
});

describe('filters over a mixed result list', () => {
  beforeEach(async () => {
    await index(
      await entities.create(project.id, {
        type: 'mechanic',
        name: 'Oxygen Drain',
        tags: ['Core-Loop'],
        status: 'active',
      }),
    );
    await index(
      await entities.create(project.id, { type: 'character', name: 'Oxygen-scarred diver' }),
    );
  });

  it('scopes to an entity type, which is what a tool page sends', async () => {
    const { items } = await search.search(project.id, {
      text: 'oxygen',
      entityTypes: ['mechanic'],
    });

    expect(items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });

  it('matches tags case-insensitively', async () => {
    const { items } = await search.search(project.id, { text: 'oxygen', tags: ['core-loop'] });

    expect(items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });

  it('filters by the source’s own status', async () => {
    const { items } = await search.search(project.id, { text: 'oxygen', statuses: ['draft'] });

    expect(items.map((item) => item.title)).toEqual(['Oxygen-scarred diver']);
  });

  it('hides archived material unless it is asked for', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen tether' });
    await index(await entities.archive(project.id, idea.id));

    const hidden = await search.search(project.id, { text: 'tether' });
    const shown = await search.search(project.id, { text: 'tether', includeArchived: true });

    expect(hidden.total).toBe(0);
    expect(shown.total).toBe(1);
  });

  it('filters by when the source itself last changed', async () => {
    const future = new Date(Date.now() + 60_000);

    await expect(
      search.search(project.id, { text: 'oxygen', updatedAfter: future }),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      search.search(project.id, { text: 'oxygen', updatedBefore: future }),
    ).resolves.toMatchObject({ total: 2 });
  });
});

describe('semantic retrieval', () => {
  it('ranks by closeness in the vector space, not by shared words', async () => {
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'mechanic', name: 'Breath economy' }),
      'oxygen oxygen dive trench',
    );
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'location', name: 'Canopy walk' }),
      'forest canopy canopy dive',
    );

    const { items } = await search.searchSemantic(project.id, { text: 'oxygen dive' });

    expect(items.map((item) => item.title)).toEqual(['Breath economy', 'Canopy walk']);
    expect(items[0]?.score).toBeGreaterThan(items[1]?.score ?? 1);
  });

  it('leaves material with nothing in common out, rather than ranking the whole project', async () => {
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'mechanic', name: 'Breath economy' }),
      'oxygen oxygen dive trench',
    );
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'location', name: 'Canopy walk' }),
      'forest canopy canopy dive',
    );

    const { items, total } = await search.searchSemantic(project.id, { text: 'trench' });

    expect(items.map((item) => item.title)).toEqual(['Breath economy']);
    expect(total).toBe(1);
  });

  it('applies the structured filters a keyword search applies', async () => {
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'mechanic', name: 'Breath economy' }),
      'oxygen dive',
    );
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'location', name: 'The Trench' }),
      'oxygen dive',
    );

    const { items } = await search.searchSemantic(project.id, {
      text: 'oxygen dive',
      entityTypes: ['location'],
    });

    expect(items.map((item) => item.title)).toEqual(['The Trench']);
  });

  it('ignores a vector built by a different model', async () => {
    const document = await index(
      await entities.create(project.id, { type: 'mechanic', name: 'Breath economy' }),
    );
    const [embedding] = await embeddings.embed(['oxygen dive']);

    await documents.saveEmbedding(project.id, document.id, {
      embedding: embedding ?? [],
      model: 'some-other-model',
      contentHash: document.contentHash,
    });

    await expect(search.searchSemantic(project.id, { text: 'oxygen dive' })).resolves.toMatchObject(
      { total: 0 },
    );
  });

  it('ignores a vector of a different width', async () => {
    const document = await index(
      await entities.create(project.id, { type: 'mechanic', name: 'Breath economy' }),
    );

    await documents.saveEmbedding(project.id, document.id, {
      embedding: [1],
      model: embeddings.model,
      contentHash: document.contentHash,
    });

    await expect(search.searchSemantic(project.id, { text: 'oxygen dive' })).resolves.toMatchObject(
      { total: 0 },
    );
  });
});

describe('keeping the index current', () => {
  it('replaces the indexed text in place rather than growing a second row', async () => {
    const mechanic = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
    });
    const first = await index(mechanic);
    const second = await index(
      await entities.update(project.id, mechanic.id, { name: 'Pressure' }),
    );

    expect(second.id).toBe(first.id);
    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 0,
    });
    await expect(search.search(project.id, { text: 'pressure' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('reports a row whose text has moved on from its vector, and only that row', async () => {
    const mechanic = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' });
    await indexWithEmbedding(mechanic, 'oxygen dive');
    await indexWithEmbedding(
      await entities.create(project.id, { type: 'location', name: 'Canopy walk' }),
      'forest canopy',
    );

    await expect(documents.listStale(project.id, 10)).resolves.toEqual([]);

    const renamed = await entities.update(project.id, mechanic.id, { name: 'Pressure Drain' });
    await index(renamed);

    const stale = await documents.listStale(project.id, 10);
    expect(stale.map((document) => document.sourceId)).toEqual([mechanic.id]);
  });

  it('keeps a vector through a re-index, so unchanged material is not re-embedded', async () => {
    const mechanic = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' });
    await indexWithEmbedding(mechanic, 'oxygen dive');

    await index(mechanic);

    await expect(documents.listStale(project.id, 10)).resolves.toEqual([]);
    await expect(search.searchSemantic(project.id, { text: 'oxygen dive' })).resolves.toMatchObject(
      { total: 1 },
    );
  });

  it('refuses a vector built from text the row has already moved past', async () => {
    const mechanic = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' });
    const document = await index(mechanic);
    await index(await entities.update(project.id, mechanic.id, { name: 'Pressure Drain' }));

    const [embedding] = await embeddings.embed(['oxygen dive']);
    await documents.saveEmbedding(project.id, document.id, {
      embedding: embedding ?? [],
      model: embeddings.model,
      // The hash of the text as it was before the rename.
      contentHash: document.contentHash,
    });

    expect(await documents.listStale(project.id, 10)).toHaveLength(1);
  });
});
