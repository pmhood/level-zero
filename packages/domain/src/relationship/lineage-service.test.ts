import { beforeEach, describe, expect, it } from 'vitest';

import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
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
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  entities = new EntityService(entityRepo, projectRepo, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  lineage = new LineageService(entities, relationships);

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

  it('refuses to promote an entity through another project', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen is currency' });

    await expect(lineage.promote(otherProject.id, idea.id, { type: 'mechanic' })).rejects.toThrow(
      NotFoundError,
    );
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
