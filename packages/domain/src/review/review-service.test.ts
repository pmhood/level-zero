import { beforeEach, describe, expect, it } from 'vitest';

import { archiveEntity, createEntity, type Entity } from '../entity/entity';
import { createAsset, type Asset } from '../asset/asset';
import { createPrototypeVersion, type PrototypeVersion } from '../prototype/prototype-version';
import { fixedClock } from '../shared/clock';
import { NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { createEntityVersion, type EntityVersion } from '../version/entity-version';
import {
  InMemoryAssetRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryPrototypeVersionRepository,
  InMemoryReviewDecisionRepository,
} from '../testing';
import { ReviewService } from './review-service';
import { ReviewTargetResolver } from './review-target-resolver';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-02T09:00:00.000Z');
const ids = sequentialIdGenerator('review');

const project = 'project-1';
const otherProject = 'project-2';

let entities: InMemoryEntityRepository;
let assets: InMemoryAssetRepository;
let prototypeVersions: InMemoryPrototypeVersionRepository;
let entityVersions: InMemoryEntityVersionRepository;
let decisions: InMemoryReviewDecisionRepository;
let service: ReviewService;

let diver: Entity;
let portrait: Asset;
let slice: PrototypeVersion;

/** Records a version of `entity` and points the entity at it, as a commit does. */
async function commit(
  entity: Entity,
  versionNumber: number,
): Promise<{ entity: Entity; version: EntityVersion }> {
  const version = await entityVersions.insert(
    createEntityVersion(
      {
        projectId: entity.projectId,
        entityId: entity.id,
        versionNumber,
        parentVersionId: null,
        snapshot: {
          name: entity.name,
          description: entity.description,
          status: entity.status,
          tags: [...entity.tags],
          data: { ...entity.data },
        },
        reason: 'manual',
      },
      { clock, ids },
    ),
  );

  return { entity: await entities.save({ ...entity, currentVersionId: version.id }), version };
}

beforeEach(async () => {
  entities = new InMemoryEntityRepository();
  assets = new InMemoryAssetRepository();
  prototypeVersions = new InMemoryPrototypeVersionRepository();
  entityVersions = new InMemoryEntityVersionRepository();
  decisions = new InMemoryReviewDecisionRepository();
  service = new ReviewService(
    decisions,
    new ReviewTargetResolver(entities, assets, prototypeVersions, entityVersions),
    { clock, ids },
  );

  diver = await entities.insert(
    createEntity({ projectId: project, type: 'character', name: 'The Diver' }, { clock, ids }),
  );
  portrait = await assets.insert(
    createAsset(
      {
        projectId: project,
        kind: 'image',
        filename: 'diver-portrait.png',
        mimeType: 'image/png',
        byteSize: 2048,
        storageKey: 'assets/diver-portrait.png',
        checksum: 'abc123',
      },
      { clock, ids },
    ),
  );
  const prototype = await entities.insert(
    createEntity({ projectId: project, type: 'prototype', name: 'Trench Run' }, { clock, ids }),
  );
  slice = await prototypeVersions.insert(
    createPrototypeVersion(
      {
        projectId: project,
        prototypeId: prototype.id,
        versionNumber: 1,
        name: 'vertical slice',
        members: [],
      },
      { clock, ids },
    ),
  );
});

describe('decide', () => {
  it('records who decided, when, and against which version', async () => {
    const { version } = await commit(diver, 1);

    const decision = await service.decide(project, {
      target: { type: 'entity', id: diver.id },
      state: 'approved',
      actor: 'ada',
      note: 'Reads well.',
    });

    expect(decision).toMatchObject({
      projectId: project,
      state: 'approved',
      actor: 'ada',
      note: 'Reads well.',
      decidedAt: new Date('2026-03-01T09:00:00.000Z'),
    });
    expect(decision.target.versionId).toBe(version.id);
  });

  it('approves an asset without a version pin', async () => {
    const decision = await service.decide(project, {
      target: { type: 'asset', id: portrait.id },
      state: 'approved',
      actor: 'ada',
    });

    expect(decision.target).toMatchObject({ type: 'asset', id: portrait.id, versionId: null });
  });

  it('approves a prototype version as the immutable thing it is', async () => {
    const decision = await service.decide(project, {
      target: { type: 'prototype_version', id: slice.id },
      state: 'approved',
      actor: 'ada',
    });

    expect(decision.target).toMatchObject({ type: 'prototype_version', id: slice.id });
    expect(
      await service.getStatus(project, { type: 'prototype_version', id: slice.id }),
    ).toMatchObject({ state: 'approved' });
  });

  it('records a section decision against its anchor alone', async () => {
    const gdd = await entities.insert(
      createEntity({ projectId: project, type: 'document', name: 'GDD' }, { clock, ids }),
    );

    await service.decide(project, {
      target: { type: 'entity', id: gdd.id, anchor: 'Core Loop' },
      state: 'approved',
      actor: 'ada',
    });

    expect(
      (await service.getStatus(project, { type: 'entity', id: gdd.id, anchor: 'Core Loop' })).state,
    ).toBe('approved');
    expect((await service.getStatus(project, { type: 'entity', id: gdd.id })).state).toBe('draft');
  });

  it('rejects a decision about a target in another project', async () => {
    await expect(
      service.decide(otherProject, {
        target: { type: 'entity', id: diver.id },
        state: 'approved',
        actor: 'ada',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a decision about a missing target', async () => {
    await expect(
      service.decide(project, {
        target: { type: 'asset', id: 'gone' },
        state: 'review',
        actor: 'ada',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a version pin naming another entity history', async () => {
    const other = await entities.insert(
      createEntity({ projectId: project, type: 'character', name: 'The Pilot' }, { clock, ids }),
    );
    const { version } = await commit(other, 1);

    await expect(
      service.decide(project, {
        target: { type: 'entity', id: diver.id, versionId: version.id },
        state: 'approved',
        actor: 'ada',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a decision with no actor', async () => {
    await expect(
      service.decide(project, {
        target: { type: 'entity', id: diver.id },
        state: 'approved',
        actor: '  ',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('still accepts a decision about an archived target', async () => {
    const archived = await entities.save(archiveEntity(diver, { clock }));

    const decision = await service.decide(project, {
      target: { type: 'entity', id: archived.id },
      state: 'rejected',
      actor: 'ada',
      note: 'Cut with the shallow-water act.',
    });

    expect(decision.state).toBe('rejected');
  });
});

describe('getStatus', () => {
  it('reads as draft with the target resolved when nothing has been decided', async () => {
    const status = await service.getStatus(project, { type: 'entity', id: diver.id });

    expect(status.state).toBe('draft');
    expect(status.target).toMatchObject({ label: 'The Diver', archived: false });
  });

  it('follows a rename, because the target is addressed by id', async () => {
    await service.decide(project, {
      target: { type: 'entity', id: diver.id },
      state: 'review',
      actor: 'ada',
    });
    await entities.save({ ...diver, name: 'The Salvager' });

    const status = await service.getStatus(project, { type: 'entity', id: diver.id });

    expect(status.state).toBe('review');
    expect(status.target?.label).toBe('The Salvager');
  });

  it('reads an archived target as archived, so a thread about one still makes sense', async () => {
    const archived = await entities.save(archiveEntity(diver, { clock }));

    const status = await service.getStatus(project, { type: 'entity', id: archived.id });

    expect(status.target).toMatchObject({ label: 'The Diver', archived: true });
  });

  it('does not carry an approval of v1 onto v2', async () => {
    const first = await commit(diver, 1);
    await service.decide(project, {
      target: { type: 'entity', id: diver.id },
      state: 'approved',
      actor: 'ada',
    });

    const approved = await service.getStatus(project, { type: 'entity', id: diver.id });
    await commit({ ...first.entity, name: 'The Diver, revised' }, 2);
    const afterCommit = await service.getStatus(project, { type: 'entity', id: diver.id });

    expect(approved.state).toBe('approved');
    expect(afterCommit.state).toBe('draft');
    expect(afterCommit.staleDecision?.actor).toBe('ada');
  });

  it('keeps the approval attached to the version it was made against', async () => {
    const first = await commit(diver, 1);
    await service.decide(project, {
      target: { type: 'entity', id: diver.id },
      state: 'approved',
      actor: 'ada',
    });
    await commit({ ...first.entity, name: 'The Diver, revised' }, 2);

    const history = await service.listHistory(project, { type: 'entity', id: diver.id });

    expect(history).toHaveLength(1);
    expect(history[0]?.target.versionId).toBe(first.version.id);
  });

  it('reports a state for a target that no longer resolves', async () => {
    await service.decide(project, {
      target: { type: 'asset', id: portrait.id },
      state: 'rejected',
      actor: 'ada',
    });
    // Nothing in the product deletes an asset row, but a decision must still
    // read if one ever goes: the row carries no foreign key to its target.
    const orphaned = new ReviewService(
      decisions,
      new ReviewTargetResolver(
        entities,
        new InMemoryAssetRepository(),
        prototypeVersions,
        entityVersions,
      ),
      { clock, ids },
    );

    const status = await orphaned.getStatus(project, { type: 'asset', id: portrait.id });

    expect(status.target).toBeNull();
    expect(status.state).toBe('rejected');
  });

  it('cannot read another project decisions', async () => {
    await service.decide(project, {
      target: { type: 'asset', id: portrait.id },
      state: 'approved',
      actor: 'ada',
    });

    expect((await service.getStatus(otherProject, { type: 'asset', id: portrait.id })).state).toBe(
      'draft',
    );
  });
});

describe('listHistory', () => {
  it('keeps every decision, newest first, without overwriting who decided what', async () => {
    const target = { type: 'asset', id: portrait.id } as const;
    const later = new ReviewService(
      decisions,
      new ReviewTargetResolver(entities, assets, prototypeVersions, entityVersions),
      { clock: laterClock, ids },
    );

    await service.decide(project, { target, state: 'review', actor: 'ada' });
    await later.decide(project, { target, state: 'approved', actor: 'kai' });

    const history = await service.listHistory(project, target);

    expect(history.map((decision) => [decision.state, decision.actor])).toEqual([
      ['approved', 'kai'],
      ['review', 'ada'],
    ]);
    expect((await service.getStatus(project, target)).state).toBe('approved');
  });

  it('lets an approval be reopened for another look', async () => {
    const target = { type: 'asset', id: portrait.id } as const;
    const later = new ReviewService(
      decisions,
      new ReviewTargetResolver(entities, assets, prototypeVersions, entityVersions),
      { clock: laterClock, ids },
    );

    await service.decide(project, { target, state: 'approved', actor: 'ada' });
    await later.decide(project, { target, state: 'review', actor: 'kai' });

    expect((await service.getStatus(project, target)).state).toBe('review');
    expect(await service.listHistory(project, target)).toHaveLength(2);
  });
});

describe('listAnchoredStatuses', () => {
  /** A design document: sections of one are anchors on the entity itself. */
  async function gdd(): Promise<Entity> {
    return entities.insert(
      createEntity({ projectId: project, type: 'document', name: 'GDD' }, { clock, ids }),
    );
  }

  it('reports where each section stands, from its newest decision', async () => {
    const document = await gdd();
    const later = new ReviewService(
      decisions,
      new ReviewTargetResolver(entities, assets, prototypeVersions, entityVersions),
      { clock: laterClock, ids },
    );

    await service.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-a' },
      state: 'review',
      actor: 'ada',
    });
    await later.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-a' },
      state: 'approved',
      actor: 'kai',
    });
    await service.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-b' },
      state: 'rejected',
      actor: 'ada',
    });

    const statuses = await service.listAnchoredStatuses(project, {
      type: 'entity',
      id: document.id,
    });

    expect(
      statuses.map((status) => [status.anchor, status.state, status.decision?.actor]).sort(),
    ).toEqual([
      ['section-a', 'approved', 'kai'],
      ['section-b', 'rejected', 'ada'],
    ]);
  });

  it('leaves the document’s own decisions out: they are not a section’s', async () => {
    const document = await gdd();

    await service.decide(project, {
      target: { type: 'entity', id: document.id },
      state: 'approved',
      actor: 'ada',
    });

    await expect(
      service.listAnchoredStatuses(project, { type: 'entity', id: document.id }),
    ).resolves.toEqual([]);
  });

  it('keeps a section approved after the document is snapshotted', async () => {
    const document = await gdd();
    await service.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-a' },
      state: 'approved',
      actor: 'ada',
    });

    // A version is a whole-document snapshot: if a section's approval were
    // pinned to one, this would unapprove every section at once.
    await commit(document, 1);

    const [status] = await service.listAnchoredStatuses(project, {
      type: 'entity',
      id: document.id,
    });
    expect(status).toMatchObject({ anchor: 'section-a', state: 'approved' });
  });

  it('still reports a section that has been deleted from the document', async () => {
    const document = await gdd();
    await service.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-gone' },
      state: 'approved',
      actor: 'ada',
    });

    // Nothing is written when a heading leaves the body, so the decision is
    // still here, and the caller is what knows it matches no section.
    await expect(
      service.listAnchoredStatuses(project, { type: 'entity', id: document.id }),
    ).resolves.toMatchObject([{ anchor: 'section-gone', state: 'approved' }]);
  });

  it('reads nothing for another project', async () => {
    const document = await gdd();
    await service.decide(project, {
      target: { type: 'entity', id: document.id, anchor: 'section-a' },
      state: 'approved',
      actor: 'ada',
    });

    await expect(
      service.listAnchoredStatuses(otherProject, { type: 'entity', id: document.id }),
    ).resolves.toEqual([]);
  });
});
