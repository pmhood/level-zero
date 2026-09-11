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
import { type AiCheckContext } from './ai-consistency-check';
import { AI_CONSISTENCY_CHECKS } from './ai-consistency-checks';
import { CONSISTENCY_CHECKS } from './consistency-checks';
import { type ProjectFacts } from './consistency-check';
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
    {
      projectId: project.id,
      prototypeId: 'prototype-1',
      versionNumber: 1,
      members: [],
      ...overrides,
    },
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
    await entityRepo.insert(
      createEntity({ projectId: otherProject.id, type: 'character', name: 'Stranger' }, deps),
    );

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

describe('runAiChecks', () => {
  /**
   * Two lore entries with different dates: the least the lore check will read,
   * and the material the judgement below pretends to have read.
   */
  async function insertLore(): Promise<Entity[]> {
    return Promise.all([
      entityRepo.insert(
        entity({ type: 'lore', name: 'The Flood', description: 'The flood came in year nine.' }),
      ),
      entityRepo.insert(
        entity({
          type: 'lore',
          name: 'The Drowning',
          description: 'The waters rose in year eleven.',
        }),
      ),
    ]);
  }

  /** An AI context that judges everything it is shown to be in tension. */
  function judging(generationId: string): AiCheckContext {
    return {
      retrieve: () => Promise.resolve([]),
      judge: (request) =>
        Promise.resolve({
          generationId,
          output: JSON.stringify({
            findings: [
              {
                severity: 'warning',
                summary: 'The two accounts of the flood read as though they describe one event.',
                evidence: request.contextEntityIds.map((entityId) => ({
                  entityId,
                  where: 'Description',
                  states: 'dates the flood differently',
                })),
              },
            ],
          }),
        }),
    };
  }

  it('writes an ai_assisted finding carrying the generation that judged it', async () => {
    await insertLore();

    const produced = await scans.runAiChecks(
      await scans.loadProjectFacts(project.id),
      judging('generation-1'),
    );

    expect(produced).toBe(1);
    const { items } = await findingRepo.listByProject(project.id);
    expect(items[0]).toMatchObject({
      checkId: 'lore-contradiction',
      origin: 'ai_assisted',
      generationId: 'generation-1',
      status: 'open',
    });
  });

  it('re-attributes a finding to the judgement that most recently produced it', async () => {
    await insertLore();
    const facts = await scans.loadProjectFacts(project.id);

    await scans.runAiChecks(facts, judging('generation-1'));
    await scans.runAiChecks(facts, judging('generation-2'));

    const { items } = await findingRepo.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ generationId: 'generation-2', status: 'open' });
  });

  it('writes nothing at all when the judgement fails', async () => {
    await insertLore();
    const broken: AiCheckContext = {
      retrieve: () => Promise.resolve([]),
      judge: () => Promise.reject(new Error('anthropic is unreachable')),
    };

    await expect(
      scans.runAiChecks(await scans.loadProjectFacts(project.id), broken),
    ).rejects.toThrow('anthropic is unreachable');

    await expect(findingRepo.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });

  it("leaves last scan's AI findings alone when this scan's AI pass never ran", async () => {
    await insertLore();
    const facts = await scans.loadProjectFacts(project.id);
    await scans.runAiChecks(facts, judging('generation-1'));

    // The next scan's deterministic pass runs, and the AI pass does not.
    await scans.runDeterministicChecks(facts);

    const { items } = await findingRepo.listByProject(project.id);
    expect(items[0]).toMatchObject({ origin: 'ai_assisted', status: 'open' });
  });

  it('closes an AI finding the next judgement no longer reports', async () => {
    await insertLore();
    const facts = await scans.loadProjectFacts(project.id);
    await scans.runAiChecks(facts, judging('generation-1'));

    const silent: AiCheckContext = {
      retrieve: () => Promise.resolve([]),
      judge: () => Promise.resolve({ generationId: 'generation-2', output: '{"findings":[]}' }),
    };
    await scans.runAiChecks(facts, silent);

    const { items } = await findingRepo.listByProject(project.id);
    expect(items[0]).toMatchObject({ status: 'resolved' });
  });
});

describe('the two check registries', () => {
  it("names its checks apart, so a finding's check id says which kind it is", () => {
    const deterministic = CONSISTENCY_CHECKS.map((check) => check.id);
    const assisted = AI_CONSISTENCY_CHECKS.map((check) => check.id);

    expect(deterministic.some((id) => assisted.includes(id))).toBe(false);
  });

  it('keeps every deterministic check synchronous and provider-free', () => {
    const facts: ProjectFacts = { projectId: project.id, entities: [], prototypeVersions: [] };

    for (const check of CONSISTENCY_CHECKS) {
      // A model call cannot happen in a function that returns before it could
      // await one, and `run` is handed nothing to make one with (§6.4).
      expect(Array.isArray(check.run(facts))).toBe(true);
      expect(check.run).toHaveLength(1);
    }
  });
});
