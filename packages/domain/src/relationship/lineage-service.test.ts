import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityRelationshipService } from './entity-relationship-service';
import { LineageService } from './lineage-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let relationships: EntityRelationshipService;
let lineage: LineageService;
let activityRepo: InMemoryActivityRepository;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  lineage = new LineageService(entities, relationships, activity);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

describe('promoting an idea', () => {
  it('creates the target entity and records the source relationship', async () => {
    const idea = await entities.create(project.id, {
      type: 'idea',
      name: 'Oxygen is currency',
      description: 'Air doubles as money',
      tags: ['Survival'],
    });

    const { source, promoted, relationship } = await lineage.promote(project.id, idea.id, {
      type: 'mechanic',
    });

    expect(promoted).toMatchObject({
      type: 'mechanic',
      name: 'Oxygen is currency',
      description: 'Air doubles as money',
      tags: ['Survival'],
    });
    expect(relationship).toMatchObject({
      sourceEntityId: idea.id,
      targetEntityId: promoted.id,
      relation: 'promoted_to',
      metadata: { fromType: 'idea', toType: 'mechanic' },
    });
    expect(source.id).toBe(idea.id);
  });

  it('records an entity_promoted activity naming the source and the promoted entity', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    const { promoted } = await lineage.promote(project.id, idea.id, { type: 'mechanic' });

    const feed = await activityRepo.listByProject(project.id, {});
    const promotion = feed.items.find((item) => item.type === 'entity_promoted');

    expect(promotion).toMatchObject({
      projectId: project.id,
      summary: 'Oxygen is currency promoted to mechanic',
      subjectType: 'entity',
      subjectId: promoted.id,
      metadata: { sourceEntityId: idea.id, sourceType: 'idea', targetType: 'mechanic' },
    });
  });

  it('preserves the original idea rather than converting it', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    const { promoted } = await lineage.promote(project.id, idea.id, { type: 'mechanic' });
    await entities.update(project.id, promoted.id, { name: 'Oxygen Budget', data: { drain: 0.4 } });

    const original = await entities.getById(project.id, idea.id);
    expect(original).toMatchObject({ type: 'idea', name: 'Oxygen is currency', data: {} });
  });

  it('promotes one idea into several entities, each with its own lineage', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    await lineage.promote(project.id, idea.id, { type: 'mechanic' });
    await lineage.promote(project.id, idea.id, { type: 'character', name: 'The Air Broker' });

    const graph = await relationships.neighborhood(project.id, idea.id);

    expect(graph.outgoing.map((edge) => edge.entity.type).sort()).toEqual([
      'character',
      'mechanic',
    ]);
    expect(graph.outgoing.every((edge) => edge.relationship.relation === 'promoted_to')).toBe(true);
  });

  it('lets the caller override the new entity fields', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    const { promoted } = await lineage.promote(project.id, idea.id, {
      type: 'character',
      name: 'The Air Broker',
      description: 'Sells breath by the minute',
      status: 'active',
      tags: ['Antagonist'],
      data: { debtLedger: true },
    });

    expect(promoted).toMatchObject({
      name: 'The Air Broker',
      description: 'Sells breath by the minute',
      status: 'active',
      tags: ['Antagonist'],
      data: { debtLedger: true },
    });
  });

  it('rejects promoting an entity to its own type', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    await expect(lineage.promote(project.id, idea.id, { type: 'idea' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('rejects a source/target pair the promotion catalogue does not offer', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    await expect(lineage.promote(project.id, idea.id, { type: 'faction' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('creates a second target when the same source is promoted twice to the same type', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    const first = await lineage.promote(project.id, idea.id, { type: 'mechanic' });
    const second = await lineage.promote(project.id, idea.id, { type: 'mechanic' });

    expect(first.promoted.id).not.toBe(second.promoted.id);

    const graph = await relationships.neighborhood(project.id, idea.id);
    expect(graph.outgoing.filter((edge) => edge.entity.type === 'mechanic')).toHaveLength(2);
  });

  it('refuses to promote an entity through another project', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    await expect(lineage.promote(otherProject.id, idea.id, { type: 'mechanic' })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('promoting a reference or moodboard into a visual direction', () => {
  it('creates a design pillar and records lineage back to the reference, leaving it untouched', async () => {
    const reference = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Trench palette',
    });

    const { source, promoted, relationship } = await lineage.promote(project.id, reference.id, {
      type: 'design_pillar',
    });

    expect(promoted).toMatchObject({ type: 'design_pillar', name: 'Trench palette' });
    expect(relationship).toMatchObject({
      sourceEntityId: reference.id,
      targetEntityId: promoted.id,
      relation: 'promoted_to',
      metadata: { fromType: 'asset_reference', toType: 'design_pillar' },
    });
    expect(source.id).toBe(reference.id);

    const original = await entities.getById(project.id, reference.id);
    expect(original).toMatchObject({ type: 'asset_reference', name: 'Trench palette' });
  });

  it('offers the same promotion from a whole board', async () => {
    const moodboard = await entities.create(project.id, {
      type: 'moodboard',
      name: 'Deep interiors',
    });

    const { promoted } = await lineage.promote(project.id, moodboard.id, {
      type: 'design_pillar',
    });

    expect(promoted.type).toBe('design_pillar');
  });

  it('answers "where did this come from?" for the promoted design pillar', async () => {
    const reference = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Trench palette',
    });
    const { promoted } = await lineage.promote(project.id, reference.id, {
      type: 'design_pillar',
    });

    const graph = await relationships.neighborhood(project.id, promoted.id);

    expect(graph.incoming).toHaveLength(1);
    expect(graph.incoming[0]).toMatchObject({
      entity: { id: reference.id, type: 'asset_reference' },
      relationship: { relation: 'promoted_to' },
    });
  });

  it('creates a second target when promoted twice', async () => {
    const reference = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Trench palette',
    });

    const first = await lineage.promote(project.id, reference.id, { type: 'design_pillar' });
    const second = await lineage.promote(project.id, reference.id, { type: 'design_pillar' });

    expect(first.promoted.id).not.toBe(second.promoted.id);

    const graph = await relationships.neighborhood(project.id, reference.id);
    expect(graph.outgoing.filter((edge) => edge.entity.type === 'design_pillar')).toHaveLength(2);
  });

  it('refuses to promote a reference through another project', async () => {
    const reference = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Trench palette',
    });

    await expect(
      lineage.promote(otherProject.id, reference.id, { type: 'design_pillar' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('generation lineage', () => {
  it('lets a generated concept trace back to what influenced it', async () => {
    const [reference, character, generated] = [
      await entities.create(project.id, { type: 'asset_reference', name: 'Mood board: trench' }),
      await entities.create(project.id, { type: 'character', name: 'Kael' }),
      await entities.create(project.id, { type: 'asset_reference', name: 'Kael concept 01' }),
    ];

    await lineage.recordGeneratedFrom(project.id, generated.id, [reference.id, character.id], {
      capability: 'image.generate',
    });

    const graph = await relationships.neighborhood(project.id, generated.id);

    expect(graph.outgoing).toHaveLength(2);
    expect(graph.outgoing.map((edge) => edge.entity.name).sort()).toEqual([
      'Kael',
      'Mood board: trench',
    ]);
    expect(graph.outgoing.every((edge) => edge.relationship.relation === 'generated_from')).toBe(
      true,
    );
    expect(graph.outgoing[0]?.relationship.metadata).toMatchObject({
      capability: 'image.generate',
    });
  });

  it('shows the influences from the other side too', async () => {
    const [reference, generated] = [
      await entities.create(project.id, { type: 'asset_reference', name: 'Mood board' }),
      await entities.create(project.id, { type: 'asset_reference', name: 'Concept 01' }),
    ];
    await lineage.recordGeneratedFrom(project.id, generated.id, [reference.id]);

    const graph = await relationships.neighborhood(project.id, reference.id);

    expect(graph.incoming.map((edge) => edge.entity.name)).toEqual(['Concept 01']);
  });

  it('ignores duplicates and self-references in the source list', async () => {
    const [reference, generated] = [
      await entities.create(project.id, { type: 'asset_reference', name: 'Mood board' }),
      await entities.create(project.id, { type: 'asset_reference', name: 'Concept 01' }),
    ];

    const created = await lineage.recordGeneratedFrom(project.id, generated.id, [
      reference.id,
      reference.id,
      generated.id,
    ]);

    expect(created).toHaveLength(1);
  });

  it('refuses to record lineage against another project entity', async () => {
    const generated = await entities.create(project.id, {
      type: 'asset_reference',
      name: 'Concept 01',
    });
    const foreign = await entities.create(otherProject.id, {
      type: 'asset_reference',
      name: 'Other board',
    });

    await expect(
      lineage.recordGeneratedFrom(project.id, generated.id, [foreign.id]),
    ).rejects.toThrow(NotFoundError);
  });
});
