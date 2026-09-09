import {
  ActivityService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  NotFoundError,
  createGeneration,
  createProject,
  documentData,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ContextResolver } from './context-resolver';
import { renderContext } from './context';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };

let projects: InMemoryProjectRepository;
let entityRepo: InMemoryEntityRepository;
let relationshipRepo: InMemoryEntityRelationshipRepository;
let assetRepo: InMemoryAssetRepository;
let generationRepo: InMemoryGenerationRepository;

let entities: EntityService;
let relationships: EntityRelationshipService;
let assets: AssetService;
let resolver: ContextResolver;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  projects = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  relationshipRepo = new InMemoryEntityRelationshipRepository();
  assetRepo = new InMemoryAssetRepository();
  generationRepo = new InMemoryGenerationRepository();

  entities = new EntityService(
    entityRepo,
    projects,
    new ActivityService(new InMemoryActivityRepository(), deps),
    deps,
  );
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  assets = new AssetService(assetRepo, projects, new InMemoryObjectStorageProvider(), deps);
  resolver = new ContextResolver(projects, entityRepo, relationshipRepo, assetRepo, generationRepo);

  project = await projects.insert(
    createProject(
      { name: 'Deep Fathom', description: 'A descent sim' },
      { clock, ids: sequentialIdGenerator('project-a') },
    ),
  );
  otherProject = await projects.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

/** The diver, the trench she descends into, and the oxygen mechanic that binds them. */
async function seedNeighborhood(): Promise<{
  diver: Entity;
  trench: Entity;
  oxygen: Entity;
  faction: Entity;
}> {
  const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
  const trench = await entities.create(project.id, { type: 'location', name: 'Cradle Trench' });
  const oxygen = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen drain' });
  const faction = await entities.create(project.id, { type: 'faction', name: 'The Salvagers' });

  await relationships.link(project.id, {
    sourceEntityId: diver.id,
    targetEntityId: trench.id,
    relation: 'appears_in',
  });
  await relationships.link(project.id, {
    sourceEntityId: trench.id,
    targetEntityId: oxygen.id,
    relation: 'depends_on',
  });
  await relationships.link(project.id, {
    sourceEntityId: faction.id,
    targetEntityId: oxygen.id,
    relation: 'implements',
  });

  return { diver, trench, oxygen, faction };
}

describe('resolving what the user pointed at', () => {
  it('carries the project and the instruction', async () => {
    const context = await resolver.resolve(project.id, { instruction: 'name three wrecks' });

    expect(context.project).toMatchObject({ name: 'Deep Fathom', description: 'A descent sim' });
    expect(context.instruction).toBe('name three wrecks');
    expect(context.entities).toEqual([]);
  });

  it('separates a selection from an @mention', async () => {
    const { diver, trench } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'write her arrival',
      selectedEntityIds: [diver.id],
      mentionedEntityIds: [trench.id],
      relatedDepth: 0,
    });

    expect(context.entities).toMatchObject([
      { id: diver.id, source: 'selected', distance: 0 },
      { id: trench.id, source: 'mention', distance: 0 },
    ]);
  });

  it('keeps the first reason an entity was named', async () => {
    const { diver } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'write her arrival',
      selectedEntityIds: [diver.id],
      mentionedEntityIds: [diver.id],
      relatedDepth: 0,
    });

    expect(context.entities).toHaveLength(1);
    expect(context.entities[0]?.source).toBe('selected');
  });

  it('rejects an id the user named that does not exist', async () => {
    await expect(
      resolver.resolve(project.id, { instruction: 'x', selectedEntityIds: ['missing'] }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects an unknown project rather than resolving an empty context', async () => {
    await expect(resolver.resolve('nope', { instruction: 'x' })).rejects.toThrow(NotFoundError);
  });
});

describe('scoping', () => {
  it('cannot reach another project through an id', async () => {
    const outsider = await entities.create(otherProject.id, {
      type: 'character',
      name: 'Sky Captain',
    });

    await expect(
      resolver.resolve(project.id, { instruction: 'x', selectedEntityIds: [outsider.id] }),
    ).rejects.toThrow(NotFoundError);
  });

  it('does not pull another project into the walk', async () => {
    const { diver } = await seedNeighborhood();
    await entities.create(otherProject.id, { type: 'location', name: 'Cloud Yard' });

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
      relatedDepth: 3,
    });

    expect(context.entities.every((entity) => entity.name !== 'Cloud Yard')).toBe(true);
  });
});

describe('walking the relationship graph', () => {
  it('pulls in one hop by default and says which edge it came through', async () => {
    const { diver, trench, oxygen } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'write her arrival',
      selectedEntityIds: [diver.id],
    });

    expect(context.entities.map((entity) => entity.id)).toEqual([diver.id, trench.id]);
    expect(context.entities.map((entity) => entity.id)).not.toContain(oxygen.id);
    expect(context.entities[1]).toMatchObject({
      source: 'related',
      distance: 1,
      relation: 'appears_in',
      viaEntityId: diver.id,
    });
  });

  it('reaches further when asked, and follows edges in either direction', async () => {
    const { diver, trench, oxygen, faction } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
      relatedDepth: 3,
    });

    expect(context.entities.map((entity) => entity.id)).toEqual([
      diver.id,
      trench.id,
      oxygen.id,
      faction.id,
    ]);
    expect(context.entities[3]).toMatchObject({ distance: 3, viaEntityId: oxygen.id });
  });

  it('follows only the relations it was asked for', async () => {
    const { diver, trench } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
      relatedDepth: 3,
      relations: ['appears_in'],
    });

    expect(context.entities.map((entity) => entity.id)).toEqual([diver.id, trench.id]);
  });

  it('stays put when the walk is disabled', async () => {
    const { diver } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
      relatedDepth: 0,
    });

    expect(context.entities.map((entity) => entity.id)).toEqual([diver.id]);
  });

  it('leaves archived neighbours out but keeps a named one', async () => {
    const { diver, trench } = await seedNeighborhood();
    await entities.archive(project.id, trench.id);

    const walked = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
    });
    expect(walked.entities.map((entity) => entity.id)).toEqual([diver.id]);

    const named = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [trench.id],
    });
    expect(named.entities[0]).toMatchObject({ id: trench.id, status: 'archived' });
  });

  it('stops at the ceiling and says so', async () => {
    const { diver } = await seedNeighborhood();

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [diver.id],
      relatedDepth: 3,
      maxEntities: 2,
    });

    expect(context.entities).toHaveLength(2);
    expect(context.truncated).toBe(true);
  });

  it('reports truncation when a hub loses edges to already-archived neighbours', async () => {
    const hub = await entities.create(project.id, { type: 'character', name: 'The Cartographer' });

    for (let index = 0; index < 6; index += 1) {
      const wreck = await entities.create(project.id, {
        type: 'location',
        name: `Wreck ${index}`,
      });
      await relationships.link(project.id, {
        sourceEntityId: hub.id,
        targetEntityId: wreck.id,
        relation: 'appears_in',
      });
      await entities.archive(project.id, wreck.id);
    }

    const context = await resolver.resolve(project.id, {
      instruction: 'x',
      selectedEntityIds: [hub.id],
      maxEntities: 5,
    });

    // All 6 of the hub's relationships point at an archived neighbour, so
    // nothing new is ever added and the entity ceiling is never reached —
    // but the per-node page (capped at maxEntities) can only return 5 of
    // the 6 edges, so the walk is still a sample and truncated must say so.
    expect(context.entities.map((entity) => entity.id)).toEqual([hub.id]);
    expect(context.truncated).toBe(true);
  });
});

describe('documents, assets and lineage', () => {
  it('splits a document body into its headed sections', async () => {
    const gdd = await entities.create(project.id, {
      type: 'document',
      name: 'Deep Fathom GDD',
      data: documentData({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'A descent sim.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pillars' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Pressure is the antagonist.' }] },
        ],
      }),
    });

    const context = await resolver.resolve(project.id, {
      instruction: 'expand the pillars',
      selectedEntityIds: [gdd.id],
    });

    expect(context.entities[0]?.sections).toEqual([
      { heading: '', text: 'A descent sim.' },
      { heading: 'Pillars', text: 'Pressure is the antagonist.' },
    ]);
  });

  it('records reference assets and rejects one from another project', async () => {
    const plate = await assets.upload(project.id, {
      kind: 'image',
      filename: 'palette.png',
      mimeType: 'image/png',
      content: Buffer.from('bytes'),
    });

    const context = await resolver.resolve(project.id, {
      instruction: 'match this palette',
      assetIds: [plate.id],
    });
    expect(context.assets).toMatchObject([
      { id: plate.id, filename: 'palette.png', source: 'reference' },
    ]);

    await expect(
      resolver.resolve(otherProject.id, { instruction: 'x', assetIds: [plate.id] }),
    ).rejects.toThrow(NotFoundError);
  });

  it('carries the generation it re-rolls', async () => {
    const parent = await generationRepo.insert(
      createGeneration(
        { projectId: project.id, capability: 'image.generate', prompt: 'a drowned cathedral' },
        deps,
      ),
    );

    const context = await resolver.resolve(project.id, {
      instruction: 'again, colder',
      parentGenerationId: parent.id,
    });

    expect(context.lineage).toMatchObject({
      generationId: parent.id,
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });
  });
});

describe('renderContext', () => {
  it('writes the project, its objects and how each got there', async () => {
    const { diver } = await seedNeighborhood();
    const context = await resolver.resolve(project.id, {
      instruction: 'write her arrival',
      selectedEntityIds: [diver.id],
    });

    const rendered = renderContext(context);

    expect(rendered).toContain('Project: Deep Fathom');
    expect(rendered).toContain('- The Diver [character] (selected)');
    expect(rendered).toContain('- Cradle Trench [location] (related via appears_in)');
  });
});
