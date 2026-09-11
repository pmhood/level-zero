import { beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../shared/errors';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { InMemoryFindingRepository } from '../testing';
import { createFinding, type CheckFinding, type Finding, type FindingEvidence } from './finding';
import { FindingService } from './finding-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T09:05:00.000Z');
const ids = sequentialIdGenerator('finding');

const evidence: FindingEvidence[] = [
  { entityId: 'prototype-1', where: 'Prototype version 2', states: 'pinned to an earlier Diver' },
  { entityId: 'entity-1', where: 'The Diver', states: 'has a newer current version' },
];

/** Everything a check reports, before the runner says what kind of claim it is. */
const reported: CheckFinding & { projectId: string; checkId: string } = {
  projectId: 'project-1',
  checkId: 'stale-prototype-pin',
  fingerprint: 'fingerprint-1',
  severity: 'warning',
  summary: 'The Diver has changed since this prototype version pinned it.',
  evidence,
};

function seedFinding(overrides: Partial<typeof reported> = {}): Finding {
  return createFinding({ ...reported, ...overrides, origin: 'deterministic' }, { clock, ids });
}

let repo: InMemoryFindingRepository;
let service: FindingService;

beforeEach(() => {
  repo = new InMemoryFindingRepository();
  service = new FindingService(repo, { clock: laterClock });
});

describe('listByProject', () => {
  it('applies default paging', async () => {
    await repo.upsert(seedFinding());

    const page = await service.listByProject('project-1');

    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });
});

describe('getById', () => {
  it('throws NotFoundError for an unknown finding', async () => {
    await expect(service.getById('project-1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for a finding from another project', async () => {
    const finding = await repo.upsert(seedFinding());

    await expect(service.getById('project-2', finding.id)).rejects.toThrow(NotFoundError);
  });
});

describe('dismiss', () => {
  it('marks the finding dismissed without touching its derived content', async () => {
    const finding = await repo.upsert(seedFinding());

    const dismissed = await service.dismiss('project-1', finding.id, {
      dismissedBy: 'pete',
      reason: 'known trade-off',
    });

    expect(dismissed).toMatchObject({
      status: 'dismissed',
      dismissedAt: laterClock.now(),
      dismissedBy: 'pete',
      dismissedReason: 'known trade-off',
      summary: finding.summary,
    });
  });

  it('throws NotFoundError rather than dismissing a finding that does not exist', async () => {
    await expect(
      service.dismiss('project-1', 'missing', { dismissedBy: 'pete' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('reopen', () => {
  it('undoes a dismissal in one call', async () => {
    const finding = await repo.upsert(seedFinding());
    await service.dismiss('project-1', finding.id, { dismissedBy: 'pete' });

    const reopened = await service.reopen('project-1', finding.id);

    expect(reopened).toMatchObject({
      status: 'open',
      dismissedAt: null,
      dismissedBy: null,
      dismissedReason: null,
    });
  });

  it('is a no-op on a finding that is not dismissed', async () => {
    const finding = await repo.upsert(seedFinding());

    const reopened = await service.reopen('project-1', finding.id);

    expect(reopened.status).toBe('open');
  });
});
