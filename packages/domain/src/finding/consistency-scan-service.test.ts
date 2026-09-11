import { beforeEach, describe, expect, it } from 'vitest';

import { createEntity, type Entity } from '../entity/entity';
import { JobService } from '../job/job-service';
import { createProject, type Project } from '../project/project';
import { createPrototypeVersion, type PrototypeVersion } from '../prototype/prototype-version';
import { ConflictError } from '../shared/errors';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryEntityRepository,
  InMemoryFindingRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { dismissFinding } from './finding';
import { CONSISTENCY_SCAN_JOB_STEPS, ConsistencyScanService } from './consistency-scan-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T09:05:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };

let projectRepo: InMemoryProjectRepository;
let entityRepo: InMemoryEntityRepository;
let prototypeVersionRepo: InMemoryPrototypeVersionRepository;
let findingRepo: InMemoryFindingRepository;
let jobs: JobService;
let scans: ConsistencyScanService;
let project: Project;

beforeEach(async () => {
  projectRepo = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  prototypeVersionRepo = new InMemoryPrototypeVersionRepository();
  findingRepo = new InMemoryFindingRepository();
  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  scans = new ConsistencyScanService(entityRepo, prototypeVersionRepo, findingRepo, jobs, deps);

  project = createProject({ name: 'Deep Six' }, deps);
  await projectRepo.insert(project);
});

function entity(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    { projectId: project.id, type: 'character', name: 'The Diver', ...overrides },
    deps,
  );
}

function draftVersion(
  overrides: Partial<Parameters<typeof createPrototypeVersion>[0]> = {},
): PrototypeVersion {
  return createPrototypeVersion(
    { projectId: project.id, prototypeId: 'prototype-1', versionNumber: 1, members: [], ...overrides },
    deps,
  );
}

describe('requestScan', () => {
  it('queues a consistency_scan job sized to the three named steps', async () => {
    const job = await scans.requestScan(project.id);

    expect(job).toMatchObject({
      projectId: project.id,
      kind: 'consistency_scan',
      targetId: project.id,
      status: 'queued',
      progress: { completed: 0, total: CONSISTENCY_SCAN_JOB_STEPS.length, step: null },
    });
  });

  it('returns the job already queued rather than queueing a second', async () => {
    const first = await scans.requestScan(project.id);
    const second = await scans.requestScan(project.id);

    expect(second.id).toBe(first.id);
    const { items } = await jobs.listByProject(project.id, { kind: 'consistency_scan' });
    expect(items).toHaveLength(1);
  });

  it('queues a new job once the previous scan has finished', async () => {
    const first = await scans.requestScan(project.id);
    await jobs.advance(project.id, first.id, { status: 'preparing_context' });
    await jobs.advance(project.id, first.id, { status: 'running' });
    await jobs.advance(project.id, first.id, { status: 'complete' });

    const second = await scans.requestScan(project.id);

    expect(second.id).not.toBe(first.id);
  });

  it('refuses to queue work for an archived project, visibly', async () => {
    const archived = createProject({ name: 'Shelved' }, deps);
    await projectRepo.insert({ ...archived, status: 'archived' });

    await expect(scans.requestScan(archived.id)).rejects.toThrow(ConflictError);
  });
});

describe('loadProjectFacts', () => {
  it('loads only the requesting project entities and prototype versions', async () => {
    const otherProject = createProject({ name: 'Other' }, deps);
    await projectRepo.insert(otherProject);

    const mine = await entityRepo.insert(entity());
    await entityRepo.insert(createEntity({ projectId: otherProject.id, type: 'character', name: 'Stranger' }, deps));

    const myVersion = await prototypeVersionRepo.insert(draftVersion());
    await prototypeVersionRepo.insert(
      createPrototypeVersion(
        { projectId: otherProject.id, prototypeId: 'prototype-2', versionNumber: 1, members: [] },
        deps,
      ),
    );

    const facts = await scans.loadProjectFacts(project.id);

    expect(facts.projectId).toBe(project.id);
    expect(facts.entities.map((e) => e.id)).toEqual([mine.id]);
    expect(facts.prototypeVersions.map((v) => v.id)).toEqual([myVersion.id]);
  });

  it('includes archived entities, since a check decides for itself what to look at', async () => {
    const archived = await entityRepo.insert({ ...entity(), status: 'archived' });

    const facts = await scans.loadProjectFacts(project.id);

    expect(facts.entities.map((e) => e.id)).toContain(archived.id);
  });
});

describe('runDeterministicChecks', () => {
  it('upserts a finding for every contradiction a registered check reports', async () => {
    const diver = await entityRepo.insert({ ...entity(), currentVersionId: 'version-2' });
    await prototypeVersionRepo.insert(
      draftVersion({ members: [{ entityId: diver.id, entityVersionId: 'version-1' }] }),
    );

    const facts = await scans.loadProjectFacts(project.id);
    const produced = await scans.runDeterministicChecks(facts);

    expect(produced).toBe(1);
    const { items } = await findingRepo.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      checkId: 'stale-prototype-pin',
      origin: 'deterministic',
      status: 'open',
    });
  });

  it('closes an open finding the scan no longer reproduces', async () => {
    const diver = await entityRepo.insert({ ...entity(), currentVersionId: 'version-2' });
    const version = await prototypeVersionRepo.insert(
      draftVersion({ members: [{ entityId: diver.id, entityVersionId: 'version-1' }] }),
    );

    await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));

    // The pin catches up: the prototype now matches the entity's current version.
    await prototypeVersionRepo.save({ ...version, status: 'archived' });

    const produced = await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));

    expect(produced).toBe(0);
    const { items } = await findingRepo.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'resolved' });
    expect(items[0]!.resolvedAt).not.toBeNull();
  });

  it('leaves a dismissed finding dismissed even after the scan stops reproducing it', async () => {
    const diver = await entityRepo.insert({ ...entity(), currentVersionId: 'version-2' });
    const version = await prototypeVersionRepo.insert(
      draftVersion({ members: [{ entityId: diver.id, entityVersionId: 'version-1' }] }),
    );

    await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));
    const { items: opened } = await findingRepo.listByProject(project.id);
    const dismissed = await findingRepo.save(
      dismissFinding(opened[0]!, { dismissedBy: 'pete' }, { clock: laterClock }),
    );

    await prototypeVersionRepo.save({ ...version, status: 'archived' });
    await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));

    const { items: after } = await findingRepo.listByProject(project.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'dismissed', dismissedAt: dismissed.dismissedAt });
  });

  it('refreshes a dismissed finding when the scan reproduces it, without reopening it', async () => {
    const diver = await entityRepo.insert({ ...entity(), currentVersionId: 'version-2' });
    await prototypeVersionRepo.insert(
      draftVersion({ members: [{ entityId: diver.id, entityVersionId: 'version-1' }] }),
    );

    await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));
    const { items: opened } = await findingRepo.listByProject(project.id);
    await findingRepo.save(
      dismissFinding(opened[0]!, { dismissedBy: 'pete' }, { clock: laterClock }),
    );

    await scans.runDeterministicChecks(await scans.loadProjectFacts(project.id));

    const { items: after } = await findingRepo.listByProject(project.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'dismissed' });
  });

  it('returns zero and writes nothing when no check finds a contradiction', async () => {
    const facts = await scans.loadProjectFacts(project.id);

    const produced = await scans.runDeterministicChecks(facts);

    expect(produced).toBe(0);
    const { items } = await findingRepo.listByProject(project.id);
    expect(items).toHaveLength(0);
  });
});
