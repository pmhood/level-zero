import {
  ActivityService,
  AssetService,
  ConflictError,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  ProjectService,
  PrototypeService,
  systemClock,
  uuidIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzlePrototypeVersionRepository } from './prototype-version-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let prototypeRepo: DrizzlePrototypeVersionRepository;
let projects: ProjectService;
let entities: EntityService;
let versions: EntityVersionService;
let assets: AssetService;
let relationships: EntityRelationshipService;
let prototypes: PrototypeService;
let project: Project;
let otherProject: Project;

beforeAll(async () => {
  client = await connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const versionRepo = new DrizzleEntityVersionRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  const relationshipRepo = new DrizzleEntityRelationshipRepository(client.db);
  prototypeRepo = new DrizzlePrototypeVersionRepository(client.db);

  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);

  projects = new ProjectService(projectRepo, deps);
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
    prototypeRepo,
    entities,
    versionRepo,
    assetRepo,
    activity,
    relationships,
    deps,
  );
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
});

/** An entity with one committed version, ready to be prototyped. */
async function committed(
  type: 'character' | 'mechanic' | 'scene',
  name: string,
  projectId = project.id,
): Promise<Entity> {
  const entity = await entities.create(projectId, { type, name, data: { revision: 1 } });
  await versions.commit(projectId, entity.id);
  return entities.getById(projectId, entity.id);
}

describe('prototype versions', () => {
  it('round-trips a version with its pinned members in order', async () => {
    const diver = await committed('character', 'The Diver');
    const oxygen = await committed('mechanic', 'Oxygen drain');
    const build = await assets.upload(project.id, {
      kind: 'build_artifact',
      filename: 'slice.zip',
      mimeType: 'application/zip',
      content: Buffer.from('build'),
    });

    const { prototype, version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      notes: 'first playable',
      buildAssetId: build.id,
      members: [{ entityId: oxygen.id }, { entityId: diver.id }],
      createdBy: 'pete',
    });

    await expect(prototypes.getById(project.id, version.id)).resolves.toMatchObject({
      prototypeId: prototype.id,
      versionNumber: 1,
      status: 'draft',
      notes: 'first playable',
      buildAssetId: build.id,
      createdBy: 'pete',
      members: [
        { entityId: oxygen.id, entityVersionId: oxygen.currentVersionId },
        { entityId: diver.id, entityVersionId: diver.currentVersionId },
      ],
    });
  });

  it('resolves the versions it captured after the entities have moved on', async () => {
    const diver = await committed('character', 'The Diver');
    const { prototype, version: first } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await entities.update(project.id, diver.id, { name: 'The Diver, rewritten' });
    await versions.commit(project.id, diver.id);
    const second = await prototypes.capture(project.id, prototype.id, {
      members: [{ entityId: diver.id }],
    });

    const historical = await prototypes.contents(project.id, first.id);
    expect(historical.entityVersions[0]?.snapshot.name).toBe('The Diver');

    const current = await prototypes.contents(project.id, second.id);
    expect(current.entityVersions[0]?.snapshot.name).toBe('The Diver, rewritten');

    const comparison = await prototypes.compare(project.id, first.id, second.id);
    expect(comparison.changed).toHaveLength(1);
    expect(comparison.changed[0]).toMatchObject({ entityId: diver.id });
  });

  it('saves annotations without touching the pinned members', async () => {
    const diver = await committed('character', 'The Diver');
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    const annotated = await prototypes.annotate(project.id, version.id, {
      status: 'playable',
      notes: 'ten minutes of play',
    });

    expect(annotated).toMatchObject({ status: 'playable', notes: 'ten minutes of play' });
    expect(annotated.members).toEqual(version.members);
  });

  it('lists every prototype version in the project, across prototypes, scoped away from another project', async () => {
    const diver = await committed('character', 'The Diver');
    const { version: first } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });
    const { version: second } = await prototypes.create(project.id, {
      prototypeName: 'Combat slice',
      members: [{ entityId: diver.id }],
    });

    const foreignDiver = await committed('character', 'Someone else', otherProject.id);
    await prototypes.create(otherProject.id, {
      prototypeName: 'Foreign slice',
      members: [{ entityId: foreignDiver.id }],
    });

    const page = await prototypeRepo.listByProject(project.id, {});

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
  });
});

describe('history is protected by the database', () => {
  it('refuses to delete an entity version a prototype pins', async () => {
    const diver = await committed('character', 'The Diver');
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expectPostgresError(
      client.db.execute(
        sql`delete from entity_versions where id = ${version.members[0]?.entityVersionId}`,
      ),
      '23503',
    );
  });

  it('refuses to delete a prototype that has versions', async () => {
    const diver = await committed('character', 'The Diver');
    const { prototype } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expectPostgresError(
      client.db.execute(sql`delete from entities where id = ${prototype.id}`),
      '23503',
    );
  });

  it('refuses to delete a build artifact a prototype version points at', async () => {
    const diver = await committed('character', 'The Diver');
    const build = await assets.upload(project.id, {
      kind: 'build_artifact',
      filename: 'slice.zip',
      mimeType: 'application/zip',
      content: Buffer.from('build'),
    });
    await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      buildAssetId: build.id,
      members: [{ entityId: diver.id }],
    });

    await expectPostgresError(
      client.db.execute(sql`delete from assets where id = ${build.id}`),
      '23503',
    );
  });

  it('cannot pin a version from another project, even bypassing the service', async () => {
    const diver = await committed('character', 'The Diver');
    const foreign = await committed('character', 'Someone else', otherProject.id);
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expectPostgresError(
      client.db.execute(
        sql`insert into prototype_entity_versions
              (prototype_version_id, project_id, entity_id, entity_version_id, position)
            values (${version.id}, ${project.id}, ${foreign.id}, ${foreign.currentVersionId}, 1)`,
      ),
      '23503',
    );
  });

  it('rejects a duplicate version number for one prototype', async () => {
    const diver = await committed('character', 'The Diver');
    const { version } = await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await expect(prototypeRepo.insert({ ...version, id: uuidIdGenerator.next() })).rejects.toThrow(
      ConflictError,
    );
  });

  it('still allows a whole project to be removed', async () => {
    const diver = await committed('character', 'The Diver');
    await prototypes.create(project.id, {
      prototypeName: 'Vertical slice',
      members: [{ entityId: diver.id }],
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select count(*)::int as count from prototype_entity_versions`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });
});

/** Drizzle wraps driver errors, so the SQLSTATE lives on the cause chain. */
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
