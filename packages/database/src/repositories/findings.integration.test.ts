import {
  ProjectService,
  createFinding,
  dismissFinding,
  systemClock,
  uuidIdGenerator,
  type CheckFinding,
  type Finding,
  type Project,
} from '@level-zero/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleFindingRepository } from './finding-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let findings: DrizzleFindingRepository;
let projects: ProjectService;
let project: Project;
let otherProject: Project;

beforeAll(async () => {
  client = await connectTestDatabase();
  findings = new DrizzleFindingRepository(client.db);
  projects = new ProjectService(new DrizzleProjectRepository(client.db), deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
});

/** What a check reports, before the runner says what kind of claim it is. */
type Reported = CheckFinding & { projectId: string; checkId: string };

function report(overrides: Partial<Reported> = {}): Reported {
  return {
    projectId: project.id,
    checkId: 'stale-prototype-pin',
    fingerprint: 'stale-pin::prototype-version-1::entity-1',
    severity: 'warning',
    summary: 'The Diver has changed since this prototype version pinned it.',
    evidence: [
      {
        entityId: 'prototype-1',
        entityVersionId: 'entity-version-1',
        where: 'Prototype version 1',
        states: 'pinned to an earlier The Diver',
      },
      {
        entityId: 'entity-1',
        entityVersionId: 'entity-version-2',
        where: 'The Diver',
        states: 'has a newer current version',
      },
    ],
    ...overrides,
  };
}

/** A fresh scan's proof for one fingerprint — what a runner hands to `upsert`. */
function reported(overrides: Partial<Reported> = {}): Finding {
  return createFinding({ ...report(overrides), origin: 'deterministic' }, deps);
}

/** The same report, judged rather than proved, with its `Generation` behind it. */
function judged(generationId: string, overrides: Partial<Reported> = {}): Finding {
  return createFinding({ ...report(overrides), origin: 'ai_assisted', generationId }, deps);
}

describe('upsert', () => {
  it('writes one row for a new fingerprint', async () => {
    const saved = await findings.upsert(reported());

    const { items, total } = await findings.listByProject(project.id);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ id: saved.id, status: 'open' });
  });

  it('round-trips an ai_assisted row with the generation that judged it', async () => {
    const generationId = uuidIdGenerator.next();

    const saved = await findings.upsert(
      judged(generationId, {
        checkId: 'lore-contradiction',
        fingerprint: 'lore-contradiction::entity-1::entity-2',
        summary: 'The two accounts of the flood read as though they describe one event twice.',
      }),
    );

    await expect(findings.findById(project.id, saved.id)).resolves.toMatchObject({
      origin: 'ai_assisted',
      generationId,
    });
  });

  it('re-attributes a finding to the judgement that most recently produced it', async () => {
    const first = await findings.upsert(judged(uuidIdGenerator.next()));
    const second = uuidIdGenerator.next();

    const rescanned = await findings.upsert(judged(second));

    expect(rescanned.id).toBe(first.id);
    expect(rescanned.generationId).toBe(second);
  });

  it('running the same check twice upserts one row, not two', async () => {
    await findings.upsert(reported());
    await findings.upsert(reported({ summary: 'The Diver has changed again.' }));

    const { items, total } = await findings.listByProject(project.id);
    expect(total).toBe(1);
    expect(items[0]?.summary).toBe('The Diver has changed again.');
  });

  it('overwrites derived content wholesale on a rescan', async () => {
    const first = await findings.upsert(reported({ severity: 'warning' }));

    const second = await findings.upsert(
      reported({
        severity: 'conflict',
        summary: 'Escalated.',
        evidence: [
          { entityId: 'prototype-1', where: 'Prototype version 1', states: 'still pinned old' },
          { entityId: 'entity-1', where: 'The Diver', states: 'moved on twice now' },
        ],
      }),
    );

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ severity: 'conflict', summary: 'Escalated.' });
    expect(second.evidence).toEqual([
      { entityId: 'prototype-1', where: 'Prototype version 1', states: 'still pinned old' },
      { entityId: 'entity-1', where: 'The Diver', states: 'moved on twice now' },
    ]);
  });

  it('dismissing a finding and re-running the check leaves it dismissed', async () => {
    const first = await findings.upsert(reported());

    const dismissed = await findings.save(
      dismissFinding(first, { dismissedBy: 'pete', reason: 'known trade-off' }, deps),
    );
    expect(dismissed.status).toBe('dismissed');

    const rescanned = await findings.upsert(
      reported({ summary: 'The Diver has changed since this prototype version pinned it, still.' }),
    );

    expect(rescanned.id).toBe(first.id);
    expect(rescanned.status).toBe('dismissed');
    expect(rescanned.dismissedBy).toBe('pete');
    expect(rescanned.dismissedReason).toBe('known trade-off');
    // The content a dismissed row shows still moves with the latest scan.
    expect(rescanned.summary).toBe(
      'The Diver has changed since this prototype version pinned it, still.',
    );
  });

  it('never lets a check touch firstSeenAt on an existing row', async () => {
    const first = await findings.upsert(reported());
    const second = await findings.upsert(reported({ summary: 'again' }));

    expect(second.firstSeenAt).toEqual(first.firstSeenAt);
  });
});

describe('project isolation', () => {
  it('never returns another project’s finding, even with the same fingerprint', async () => {
    await findings.upsert(reported({ projectId: project.id }));
    await findings.upsert(
      reported({ projectId: otherProject.id, summary: 'Unrelated finding in another project.' }),
    );

    const mine = await findings.listByProject(project.id);
    expect(mine.total).toBe(1);
    expect(mine.items[0]?.projectId).toBe(project.id);

    const theirs = await findings.listByProject(otherProject.id);
    expect(theirs.total).toBe(1);
    expect(theirs.items[0]?.projectId).toBe(otherProject.id);
  });
});
