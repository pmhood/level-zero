import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { type EntityType } from '../entity/entity-type';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityRelationshipService } from './entity-relationship-service';
import { LINEAGE_RELATION_TYPES, RELATION_TYPES, isLineageRelation } from './relation-type';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let relationships: EntityRelationshipService;
let projectA: Project;
let projectB: Project;

async function entity(project: Project, type: EntityType, name: string) {
  return entities.create(project.id, { type, name });
}

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);

  projectA = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  projectB = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

describe('relation types', () => {
  it('covers every relation the architecture calls for', () => {
    expect(RELATION_TYPES).toEqual([
      'contains',
      'references',
      'inspired_by',
      'generated_from',
      'derived_from',
      'promoted_to',
      'depends_on',
      'implements',
      'appears_in',
      'belongs_to',
      'replaces',
    ]);
  });

  it('separates lineage relations from structural ones', () => {
    expect(LINEAGE_RELATION_TYPES.every(isLineageRelation)).toBe(true);
    expect(isLineageRelation('contains')).toBe(false);
    expect(isLineageRelation('generated_from')).toBe(true);
  });
});

describe('linking entities', () => {
  it('links a character to a faction, location, mechanic and asset without copying them', async () => {
    const kael = await entity(projectA, 'character', 'Kael');
    const targets = [
      await entity(projectA, 'faction', 'The Tide'),
      await entity(projectA, 'location', 'Fathom Station'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
      await entity(projectA, 'asset_reference', 'Kael portrait'),
    ];

    for (const target of targets) {
      await relationships.link(projectA.id, {
        sourceEntityId: kael.id,
        targetEntityId: target.id,
        relation: 'references',
      });
    }

    const graph = await relationships.neighborhood(projectA.id, kael.id);

    expect(graph.outgoing).toHaveLength(4);
    expect(graph.outgoing.map((edge) => edge.entity.type).sort()).toEqual([
      'asset_reference',
      'faction',
      'location',
      'mechanic',
    ]);
    // The linked entities are still their own single records.
    for (const target of targets) {
      await expect(entities.getById(projectA.id, target.id)).resolves.toMatchObject({
        id: target.id,
      });
    }
  });

  it('stores metadata on the edge', async () => {
    const [kael, station] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'location', 'Fathom Station'),
    ];

    const edge = await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: station.id,
      relation: 'appears_in',
      metadata: { act: 2, note: 'first meeting' },
    });

    expect(edge.metadata).toEqual({ act: 2, note: 'first meeting' });
  });

  it('rejects a self-referencing edge', async () => {
    const kael = await entity(projectA, 'character', 'Kael');

    await expect(
      relationships.link(projectA.id, {
        sourceEntityId: kael.id,
        targetEntityId: kael.id,
        relation: 'references',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an unknown relation type', async () => {
    const [a, b] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
    ];

    await expect(
      relationships.link(projectA.id, {
        sourceEntityId: a.id,
        targetEntityId: b.id,
        relation: 'befriends' as never,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a duplicate edge of the same relation', async () => {
    const [a, b] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
    ];
    const link = { sourceEntityId: a.id, targetEntityId: b.id, relation: 'belongs_to' as const };

    await relationships.link(projectA.id, link);

    await expect(relationships.link(projectA.id, link)).rejects.toThrow(ConflictError);
  });

  it('allows two different relations between the same pair', async () => {
    const [a, b] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
    ];

    await relationships.link(projectA.id, {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      relation: 'belongs_to',
    });
    await expect(
      relationships.link(projectA.id, {
        sourceEntityId: a.id,
        targetEntityId: b.id,
        relation: 'references',
      }),
    ).resolves.toMatchObject({ relation: 'references' });
  });
});

describe('project isolation', () => {
  it('refuses to link entities from two different projects', async () => {
    const kael = await entity(projectA, 'character', 'Kael');
    const otherFaction = await entity(projectB, 'faction', 'Sky Cult');

    await expect(
      relationships.link(projectA.id, {
        sourceEntityId: kael.id,
        targetEntityId: otherFaction.id,
        relation: 'belongs_to',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses to link when the source belongs to another project', async () => {
    const kael = await entity(projectA, 'character', 'Kael');
    const skyLocation = await entity(projectB, 'location', 'Cloud Deck');

    await expect(
      relationships.link(projectB.id, {
        sourceEntityId: kael.id,
        targetEntityId: skyLocation.id,
        relation: 'appears_in',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('never reads an edge through the wrong project', async () => {
    const [a, b] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
    ];
    const edge = await relationships.link(projectA.id, {
      sourceEntityId: a.id,
      targetEntityId: b.id,
      relation: 'belongs_to',
    });

    await expect(relationships.getById(projectB.id, edge.id)).rejects.toThrow(NotFoundError);
  });
});

describe('reading the graph around an entity', () => {
  it('separates incoming from outgoing edges', async () => {
    const [idea, mechanic, scene] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
      await entity(projectA, 'scene', 'The Dive'),
    ];

    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });
    await relationships.link(projectA.id, {
      sourceEntityId: scene.id,
      targetEntityId: mechanic.id,
      relation: 'implements',
    });

    const graph = await relationships.neighborhood(projectA.id, mechanic.id);

    expect(graph.entity.id).toBe(mechanic.id);
    expect(graph.outgoing.map((edge) => [edge.relationship.relation, edge.entity.name])).toEqual([
      ['derived_from', 'Oxygen is currency'],
    ]);
    expect(graph.incoming.map((edge) => [edge.relationship.relation, edge.entity.name])).toEqual([
      ['implements', 'The Dive'],
    ]);
  });

  it('filters by direction and by relation type', async () => {
    const [kael, faction, station] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
      await entity(projectA, 'location', 'Fathom Station'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: faction.id,
      relation: 'belongs_to',
    });
    await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: station.id,
      relation: 'appears_in',
    });

    await expect(
      relationships.listForEntity(projectA.id, kael.id, { relations: ['belongs_to'] }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      relationships.listForEntity(projectA.id, faction.id, { direction: 'outgoing' }),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      relationships.listForEntity(projectA.id, faction.id, { direction: 'incoming' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('reports a missing entity rather than an empty graph', async () => {
    await expect(relationships.neighborhood(projectA.id, 'missing')).rejects.toThrow(NotFoundError);
  });
});

describe('archiving does not destroy lineage', () => {
  it('keeps edges and still resolves an archived neighbour', async () => {
    const [idea, mechanic] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });

    await entities.archive(projectA.id, idea.id);

    const graph = await relationships.neighborhood(projectA.id, mechanic.id);
    expect(graph.outgoing).toHaveLength(1);
    expect(graph.outgoing[0]?.entity).toMatchObject({
      name: 'Oxygen is currency',
      status: 'archived',
    });
  });
});

describe('unlinking', () => {
  it('removes a structural link', async () => {
    const [kael, station] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'location', 'Fathom Station'),
    ];
    const edge = await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: station.id,
      relation: 'appears_in',
    });

    await relationships.unlink(projectA.id, edge.id);

    await expect(relationships.getById(projectA.id, edge.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses to remove a lineage edge, because it is history', async () => {
    const [idea, mechanic] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
    ];
    const edge = await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });

    await expect(relationships.unlink(projectA.id, edge.id)).rejects.toThrow(ConflictError);
    await expect(relationships.getById(projectA.id, edge.id)).resolves.toMatchObject({
      id: edge.id,
    });
  });

  it('refuses to unlink through the wrong project', async () => {
    const [kael, station] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'location', 'Fathom Station'),
    ];
    const edge = await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: station.id,
      relation: 'appears_in',
    });

    await expect(relationships.unlink(projectB.id, edge.id)).rejects.toThrow(NotFoundError);
  });
});
