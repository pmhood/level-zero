import { describe, expect, it } from 'vitest';

import { createEntity, type Entity } from '../entity/entity';
import { createPrototypeVersion, type PrototypeVersion } from '../prototype/prototype-version';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { fingerprint, type ProjectFacts } from './consistency-check';
import { stalePrototypePinCheck } from './stale-prototype-pin-check';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const projectId = 'project-1';

function entity(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    { projectId, type: 'character', name: 'The Diver', ...overrides },
    { clock, ids: sequentialIdGenerator('entity') },
  );
}

/** An entity as it would read once versioned — `currentVersionId` set directly, no version rows needed. */
function withCurrentVersion(base: Entity, versionId: string): Entity {
  return { ...base, currentVersionId: versionId };
}

function draftVersion(
  overrides: Partial<Parameters<typeof createPrototypeVersion>[0]> = {},
): PrototypeVersion {
  return createPrototypeVersion(
    {
      projectId,
      prototypeId: 'prototype-1',
      versionNumber: 1,
      members: [],
      ...overrides,
    },
    { clock, ids: sequentialIdGenerator('prototype-version') },
  );
}

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    projectId,
    entities: [],
    prototypeVersions: [],
    sectionDecisions: [],
    ...overrides,
  };
}

describe('stalePrototypePinCheck', () => {
  it('flags a draft version pinned to an entity version that is no longer current', () => {
    const diver = withCurrentVersion(entity(), 'version-2');
    const version = draftVersion({
      members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
    });

    const findings = stalePrototypePinCheck.run(
      facts({ entities: [diver], prototypeVersions: [version] }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fingerprint: fingerprint('stale-prototype-pin', version.id, diver.id),
      severity: 'warning',
      summary: 'The Diver has changed since this prototype version pinned it.',
      evidence: [
        {
          entityId: version.prototypeId,
          entityVersionId: 'version-1',
          where: `Prototype version ${version.versionNumber}`,
          states: 'pinned to an earlier The Diver',
        },
        {
          entityId: diver.id,
          entityVersionId: 'version-2',
          where: 'The Diver',
          states: 'has a newer current version',
        },
      ],
    });
  });

  it('does not flag a pin that matches the entity’s current version', () => {
    const diver = withCurrentVersion(entity(), 'version-1');
    const version = draftVersion({
      members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
    });

    expect(
      stalePrototypePinCheck.run(facts({ entities: [diver], prototypeVersions: [version] })),
    ).toEqual([]);
  });

  it('does not flag playable or archived prototype versions', () => {
    const diver = withCurrentVersion(entity(), 'version-2');

    for (const status of ['playable', 'archived'] as const) {
      const version = draftVersion({
        status,
        members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
      });

      expect(
        stalePrototypePinCheck.run(facts({ entities: [diver], prototypeVersions: [version] })),
      ).toEqual([]);
    }
  });

  it('does not flag an entity that has never been versioned', () => {
    const unversioned = entity();
    const version = draftVersion({
      members: [{ entityId: unversioned.id, entityVersionId: 'version-1' }],
    });

    expect(
      stalePrototypePinCheck.run(facts({ entities: [unversioned], prototypeVersions: [version] })),
    ).toEqual([]);
  });

  it('ignores a pin whose entity is not in the facts it was given', () => {
    const version = draftVersion({
      members: [{ entityId: 'ghost-entity', entityVersionId: 'version-1' }],
    });

    expect(stalePrototypePinCheck.run(facts({ prototypeVersions: [version] }))).toEqual([]);
  });

  it('produces the same fingerprint for the same pin on repeated runs', () => {
    const diver = withCurrentVersion(entity(), 'version-2');
    const version = draftVersion({
      members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
    });
    const oneFacts = facts({ entities: [diver], prototypeVersions: [version] });

    const first = stalePrototypePinCheck.run(oneFacts);
    const second = stalePrototypePinCheck.run(oneFacts);

    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
  });

  it('never cites an object outside the facts it was given', () => {
    // A second project's records exist, but are never included in `facts` —
    // `ProjectFacts` holds one project's records, so the check has nothing
    // else it could cite even if it wanted to (§10).
    const otherProjectEntity = withCurrentVersion(
      createEntity(
        { projectId: 'project-2', type: 'character', name: 'Impostor' },
        { clock, ids: sequentialIdGenerator('other-entity') },
      ),
      'other-version-2',
    );
    const diver = withCurrentVersion(entity(), 'version-2');
    const version = draftVersion({
      members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
    });

    const findings = stalePrototypePinCheck.run(
      facts({ entities: [diver], prototypeVersions: [version] }),
    );

    const citedIds = findings.flatMap((finding) => finding.evidence.map((item) => item.entityId));
    expect(citedIds).not.toContain(otherProjectEntity.id);
    for (const id of citedIds) {
      expect([diver.id, version.prototypeId]).toContain(id);
    }
  });
});
