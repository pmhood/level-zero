import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { AssetService } from '../asset/asset-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { EntityRelationshipService } from '../relationship/entity-relationship-service';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { EntityVersionService } from '../version/entity-version-service';
import { PrototypeService } from './prototype-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let versions: EntityVersionService;
let assets: AssetService;
let relationships: EntityRelationshipService;
let prototypes: PrototypeService;
let activityRepo: InMemoryActivityRepository;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const assetRepo = new InMemoryAssetRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  assets = new AssetService(
    assetRepo,
    projectRepo,
    new InMemoryObjectStorageProvider(),
    activity,
    deps,
  );
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  prototypes = new PrototypeService(
    new InMemoryPrototypeVersionRepository(),
    entities,
    versionRepo,
    assetRepo,
    activity,
    relationships,
    deps,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

/** An entity with one committed version, ready to be prototyped. */
async function committed(
  type: 'character' | 'mechanic' | 'scene',
  name: string,
  projectId = project.id,
) {
  const entity = await entities.create(projectId, { type, name, data: { revision: 1 } });
  await versions.commit(projectId, entity.id);
  return entities.getById(projectId, entity.id);
}

describe('creating a prototype', () => {
  it('creates a prototype entity and pins the current version of each member', async () => {
    const diver = await committed('character', 'The Diver');
    const oxygen = await committed('mechanic', 'Oxygen drain');
    const trench = await committed('scene', 'The trench');

    const { prototype, version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }, { entityId: oxygen.id }, { entityId: trench.id }],
    });

    expect(prototype).toMatchObject({ type: 'prototype', name: 'Vertical slice' });
    expect(version).toMatchObject({ prototypeId: prototype.id, versionNumber: 1, status: 'draft' });
    expect(version.members).toEqual([
      { entityId: diver.id, entityVersionId: diver.currentVersionId },
      { entityId: oxygen.id, entityVersionId: oxygen.currentVersionId },
      { entityId: trench.id, entityVersionId: trench.currentVersionId },
    ]);
  });

  it('records a prototype_version_created activity naming the prototype and version', async () => {
    const diver = await committed('character', 'The Diver');

    const { prototype, version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      name: 'First playable',
      members: [{ entityId: diver.id }],
    });

    const feed = await activityRepo.listByProject(project.id, {});
    const captured = feed.items.find((item) => item.type === 'prototype_version_created');

    expect(captured).toMatchObject({
      summary: 'Vertical slice v1 created: First playable',
      subjectType: 'prototype_version',
      subjectId: version.id,
      metadata: { prototypeId: prototype.id, versionNumber: 1 },
    });
  });

  it('pins an explicitly named version instead of the current one', async () => {
    const diver = await committed('character', 'The Diver');
    const first = diver.currentVersionId;
    await entities.update(project.id, diver.id, { name: 'The Diver, later' });
    await versions.commit(project.id, diver.id);

    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Historical slice',
      members: [{ entityId: diver.id, entityVersionId: first }],
    });

    expect(version.members).toEqual([{ entityId: diver.id, entityVersionId: first }]);
  });

  it('refuses an entity that has never been committed', async () => {
    const draft = await entities.create(project.id, { type: 'character', name: 'Unversioned' });

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Too early',
        members: [{ entityId: draft.id }],
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('promoting a mechanic into a prototype', () => {
  it('records a promoted_to edge from the source to the new prototype', async () => {
    const oxygen = await committed('mechanic', 'Oxygen drain');

    const { prototype, version } = await prototypes.create(project.id, {
      prototypeName: 'Oxygen drain, prototyped',
      members: [{ entityId: oxygen.id }],
      promotedFromEntityId: oxygen.id,
    });

    expect(version.members).toEqual([
      { entityId: oxygen.id, entityVersionId: oxygen.currentVersionId },
    ]);

    const graph = await relationships.neighborhood(project.id, oxygen.id);
    expect(graph.outgoing).toHaveLength(1);
    expect(graph.outgoing[0]).toMatchObject({
      direction: 'outgoing',
      entity: { id: prototype.id, type: 'prototype' },
      relationship: {
        sourceEntityId: oxygen.id,
        targetEntityId: prototype.id,
        relation: 'promoted_to',
        metadata: { fromType: 'mechanic', toType: 'prototype' },
      },
    });
  });

  it('promotes the same mechanic into two prototypes', async () => {
    const oxygen = await committed('mechanic', 'Oxygen drain');

    const first = await prototypes.create(project.id, {
      prototypeName: 'First experiment',
      members: [{ entityId: oxygen.id }],
      promotedFromEntityId: oxygen.id,
    });
    const second = await prototypes.create(project.id, {
      prototypeName: 'Second experiment',
      members: [{ entityId: oxygen.id }],
      promotedFromEntityId: oxygen.id,
    });

    expect(first.prototype.id).not.toBe(second.prototype.id);

    const graph = await relationships.neighborhood(project.id, oxygen.id);
    expect(graph.outgoing.filter((edge) => edge.entity.type === 'prototype')).toHaveLength(2);
  });

  it('rejects a source type the promotion catalogue does not offer', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'A rough idea' });

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Too early',
        members: [],
        promotedFromEntityId: idea.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to promote a source entity from another project', async () => {
    const foreign = await committed('mechanic', 'Someone else', otherProject.id);

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Cross-project promotion',
        members: [],
        promotedFromEntityId: foreign.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('historical integrity', () => {
  it('keeps resolving the versions it captured after the entities change', async () => {
    const diver = await committed('character', 'The Diver');
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await entities.update(project.id, diver.id, { name: 'The Diver, rewritten' });
    await versions.commit(project.id, diver.id);

    const contents = await prototypes.contents(project.id, version.id);

    expect(contents.entityVersions).toHaveLength(1);
    expect(contents.entityVersions[0]).toMatchObject({
      id: diver.currentVersionId,
      entityId: diver.id,
      snapshot: { name: 'The Diver' },
    });
    await expect(entities.getById(project.id, diver.id)).resolves.toMatchObject({
      name: 'The Diver, rewritten',
    });
  });

  it('captures a later version against the newer entity versions', async () => {
    const diver = await committed('character', 'The Diver');
    const oxygen = await committed('mechanic', 'Oxygen drain');
    const { prototype, version: first } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }, { entityId: oxygen.id }],
    });

    await entities.update(project.id, diver.id, { data: { revision: 2 } });
    await versions.commit(project.id, diver.id);
    const wreck = await committed('scene', 'The wreck');

    const second = await prototypes.capture(project.id, prototype.id, {
      name: 'Playtest build',
      members: [{ entityId: diver.id }, { entityId: wreck.id }],
    });

    expect(second.versionNumber).toBe(2);
    expect(first.members).not.toEqual(second.members);

    const comparison = await prototypes.compare(project.id, first.id, second.id);
    expect(comparison.changed).toEqual([
      {
        entityId: diver.id,
        from: first.members[0]?.entityVersionId ?? null,
        to: second.members[0]?.entityVersionId ?? null,
      },
    ]);
    expect(comparison.added).toEqual([
      { entityId: wreck.id, from: null, to: wreck.currentVersionId },
    ]);
    expect(comparison.removed).toEqual([
      { entityId: oxygen.id, from: oxygen.currentVersionId, to: null },
    ]);
  });

  it('lists versions newest first', async () => {
    const diver = await committed('character', 'The Diver');
    const { prototype } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });
    await prototypes.capture(project.id, prototype.id, { members: [{ entityId: diver.id }] });

    const page = await prototypes.list(project.id, prototype.id);

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.versionNumber)).toEqual([2, 1]);
  });
});

describe('comparison', () => {
  it('refuses to compare versions of two different prototypes', async () => {
    const diver = await committed('character', 'The Diver');
    const one = await prototypes.create(project.id, {
      prototypeName: 'One',
      members: [{ entityId: diver.id }],
    });
    const two = await prototypes.create(project.id, {
      prototypeName: 'Two',
      members: [{ entityId: diver.id }],
    });

    await expect(prototypes.compare(project.id, one.version.id, two.version.id)).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('annotations', () => {
  it('marks a version playable and attaches its build artifact', async () => {
    const diver = await committed('character', 'The Diver');
    const build = await assets.upload(project.id, {
      kind: 'build_artifact',
      filename: 'slice.zip',
      mimeType: 'application/zip',
      content: Buffer.from('build'),
    });
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    const annotated = await prototypes.annotate(project.id, version.id, {
      status: 'playable',
      buildAssetId: build.id,
      notes: 'ten minutes of play',
    });

    expect(annotated).toMatchObject({ status: 'playable', buildAssetId: build.id });
    expect(annotated.members).toEqual(version.members);
    await expect(prototypes.contents(project.id, version.id)).resolves.toMatchObject({
      buildAsset: { id: build.id, kind: 'build_artifact' },
    });
  });

  it('rejects a build artifact from another project', async () => {
    const diver = await committed('character', 'The Diver');
    const foreignBuild = await assets.upload(otherProject.id, {
      kind: 'build_artifact',
      filename: 'other.zip',
      mimeType: 'application/zip',
      content: Buffer.from('build'),
    });
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expect(
      prototypes.annotate(project.id, version.id, { buildAssetId: foreignBuild.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('project and prototype scoping', () => {
  it('refuses an entity from another project', async () => {
    const foreign = await committed('character', 'Someone else', otherProject.id);

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Cross-project',
        members: [{ entityId: foreign.id }],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses a version belonging to a different entity', async () => {
    const diver = await committed('character', 'The Diver');
    const oxygen = await committed('mechanic', 'Oxygen drain');

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Mismatched',
        members: [{ entityId: diver.id, entityVersionId: oxygen.currentVersionId }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a version from another project', async () => {
    const diver = await committed('character', 'The Diver');
    const foreign = await committed('character', 'Someone else', otherProject.id);

    await expect(
      prototypes.create(project.id, {
        prototypeName: 'Cross-project version',
        members: [{ entityId: diver.id, entityVersionId: foreign.currentVersionId }],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('hides another project prototype version rather than reporting it', async () => {
    const diver = await committed('character', 'The Diver');
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expect(prototypes.getById(otherProject.id, version.id)).rejects.toThrow(NotFoundError);
  });

  it('only captures versions against a prototype entity', async () => {
    const diver = await committed('character', 'The Diver');

    await expect(
      prototypes.capture(project.id, diver.id, { members: [{ entityId: diver.id }] }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to capture against an archived prototype', async () => {
    const diver = await committed('character', 'The Diver');
    const { prototype } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });
    await entities.archive(project.id, prototype.id);

    await expect(
      prototypes.capture(project.id, prototype.id, { members: [{ entityId: diver.id }] }),
    ).rejects.toThrow(ConflictError);
  });
});
