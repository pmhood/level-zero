import { beforeEach, describe, expect, it } from 'vitest';

import { createAsset, type Asset } from '../asset/asset';
import { createEntity, type Entity } from '../entity/entity';
import {
  completeGeneration,
  createGeneration,
  dispatchGeneration,
  type Generation,
} from '../generation/generation';
import { ReviewTargetResolver } from '../review/review-target-resolver';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryAssetMarkRepository,
  InMemoryAssetRepository,
  InMemoryAssetSelectionRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryGenerationRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { AssetSelectionService } from './asset-selection-service';

const project = 'project-1';
const otherProject = 'project-2';

/**
 * A clock the test moves on, because "the newest decision" is the whole
 * mechanism here and every row needs its own instant.
 */
let instant = new Date('2026-03-01T09:00:00.000Z');
const clock: Clock = { now: () => new Date(instant) };
const minutesLater = (minutes: number) => {
  instant = new Date(instant.getTime() + minutes * 60_000);
};

const ids = sequentialIdGenerator('sel');

let entities: InMemoryEntityRepository;
let assets: InMemoryAssetRepository;
let selections: InMemoryAssetSelectionRepository;
let marks: InMemoryAssetMarkRepository;
let generations: InMemoryGenerationRepository;
let service: AssetSelectionService;

let diver: Entity;
let concepts: Asset[];

async function image(projectId: string, filename: string): Promise<Asset> {
  return assets.insert(
    createAsset(
      {
        projectId,
        kind: 'image',
        filename,
        mimeType: 'image/png',
        byteSize: 2048,
        storageKey: `assets/${filename}`,
        checksum: filename,
      },
      { clock, ids },
    ),
  );
}

beforeEach(async () => {
  instant = new Date('2026-03-01T09:00:00.000Z');
  entities = new InMemoryEntityRepository();
  assets = new InMemoryAssetRepository();
  selections = new InMemoryAssetSelectionRepository();
  marks = new InMemoryAssetMarkRepository();
  generations = new InMemoryGenerationRepository();
  service = new AssetSelectionService(
    selections,
    marks,
    new ReviewTargetResolver(
      entities,
      assets,
      new InMemoryPrototypeVersionRepository(),
      new InMemoryEntityVersionRepository(),
    ),
    { clock, ids },
  );

  diver = await entities.insert(
    createEntity({ projectId: project, type: 'character', name: 'The Diver' }, { clock, ids }),
  );
  concepts = [
    await image(project, 'diver-a.png'),
    await image(project, 'diver-b.png'),
    await image(project, 'diver-c.png'),
  ];
});

const portrait = () => ({ entityId: diver.id, purpose: 'portrait' });
const costume = () => ({ entityId: diver.id, purpose: 'costume' });

describe('triaging a wall of results', () => {
  it('stars and shortlists the same asset independently', async () => {
    await service.mark(project, { assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' });
    await service.mark(project, { assetId: concepts[0]!.id, kind: 'shortlisted', actor: 'Ada' });

    expect((await service.listMarks(project)).map((mark) => mark.kind).sort()).toEqual([
      'favorite',
      'shortlisted',
    ]);
  });

  it('treats marking twice as marking once', async () => {
    const first = await service.mark(project, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'Ada',
    });
    minutesLater(10);
    const again = await service.mark(project, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'Brun',
    });

    expect(again).toEqual(first);
    expect(await service.listMarks(project)).toHaveLength(1);
  });

  it('takes a mark off, and says so when there was none', async () => {
    await service.mark(project, { assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' });

    expect(await service.unmark(project, concepts[0]!.id, 'favorite')).toBe(true);
    expect(await service.unmark(project, concepts[0]!.id, 'favorite')).toBe(false);
    expect(await service.listMarks(project)).toEqual([]);
  });

  it('narrows a read to one kind of mark', async () => {
    await service.mark(project, { assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' });
    await service.mark(project, { assetId: concepts[1]!.id, kind: 'shortlisted', actor: 'Ada' });

    const shortlist = await service.listMarks(project, ['shortlisted']);
    expect(shortlist.map((mark) => mark.assetId)).toEqual([concepts[1]!.id]);
  });

  it('refuses to mark an asset from another project', async () => {
    const elsewhere = await image(otherProject, 'other.png');

    await expect(
      service.mark(project, { assetId: elsewhere.id, kind: 'favorite', actor: 'Ada' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('keeps one project out of another project’s shortlist', async () => {
    await service.mark(project, { assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' });

    expect(await service.listMarks(otherProject)).toEqual([]);
  });
});

describe('approving for a purpose', () => {
  it('starts with nothing approved, because generating is not choosing', async () => {
    const summary = await service.getSummary(project, portrait());

    expect(summary).toEqual({ context: portrait(), current: [], history: [] });
  });

  it('records the actor, the moment and what the asset was approved for', async () => {
    const { approval } = await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
      note: 'This is the one.',
    });

    expect(approval).toMatchObject({
      assetId: concepts[0]!.id,
      context: { entityId: diver.id, purpose: 'portrait' },
      state: 'approved',
      actor: 'Ada',
      note: 'This is the one.',
      supersededBySelectionId: null,
    });
    expect(approval.decidedAt).toEqual(new Date('2026-03-01T09:00:00.000Z'));
  });

  it('answers "approved for what?" per purpose rather than per asset', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[1]!.id, context: costume(), actor: 'Ada' });

    const asPortrait = await service.getSummary(project, portrait());
    const asCostume = await service.getSummary(project, costume());

    expect(asPortrait.current.map((selection) => selection.assetId)).toEqual([concepts[0]!.id]);
    expect(asCostume.current.map((selection) => selection.assetId)).toEqual([concepts[1]!.id]);
  });

  it('lets one asset be the portrait and a costume exploration at once', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[0]!.id, context: costume(), actor: 'Ada' });

    expect((await service.getSummary(project, portrait())).current).toHaveLength(1);
    expect((await service.getSummary(project, costume())).current).toHaveLength(1);
  });

  it('keeps more than one asset approved for the same purpose', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: costume(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[1]!.id, context: costume(), actor: 'Ada' });

    const summary = await service.getSummary(project, costume());
    expect(summary.current.map((selection) => selection.assetId)).toEqual([
      concepts[1]!.id,
      concepts[0]!.id,
    ]);
  });

  it('refuses an approval for an entity that does not exist', async () => {
    await expect(
      service.approve(project, {
        assetId: concepts[0]!.id,
        context: { entityId: 'missing', purpose: 'portrait' },
        actor: 'Ada',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses an approval naming another project’s entity', async () => {
    const elsewhere = await entities.insert(
      createEntity({ projectId: otherProject, type: 'character', name: 'Other' }, { clock, ids }),
    );

    await expect(
      service.approve(project, {
        assetId: concepts[0]!.id,
        context: { entityId: elsewhere.id, purpose: 'portrait' },
        actor: 'Ada',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('keeps one project’s selections out of another’s', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });

    expect((await service.getSummary(otherProject, portrait())).history).toEqual([]);
  });
});

describe('rejecting', () => {
  it('records the rejection without touching the file', async () => {
    const rejection = await service.reject(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
      note: 'Reads as a different character.',
    });

    expect(rejection.state).toBe('rejected');
    expect(await assets.findById(project, concepts[0]!.id)).toEqual(concepts[0]);
  });

  it('leaves a rejected asset free to be approved for something else', async () => {
    await service.reject(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[0]!.id, context: costume(), actor: 'Ada' });

    expect((await service.getSummary(project, portrait())).current).toEqual([]);
    expect((await service.getSummary(project, costume())).current).toHaveLength(1);
  });

  it('keeps a rejected concept inspectable and traceable', async () => {
    await service.reject(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
      note: 'Too clean.',
    });

    const history = await service.listForAsset(project, concepts[0]!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ state: 'rejected', note: 'Too clean.' });
  });

  it('records reconsidering as its own row rather than erasing the first', async () => {
    await service.reject(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(60);
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Brun',
    });

    const summary = await service.getSummary(project, portrait());
    expect(summary.current).toHaveLength(1);
    expect(summary.history.map((selection) => selection.state)).toEqual(['approved', 'rejected']);
  });
});

describe('superseding', () => {
  it('points the superseded row at the approval that replaced it', async () => {
    const first = await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(30);
    const second = await service.approve(project, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'Brun',
      supersedes: [concepts[0]!.id],
    });

    expect(second.superseded).toHaveLength(1);
    expect(second.superseded[0]).toMatchObject({
      assetId: concepts[0]!.id,
      state: 'superseded',
      actor: 'Brun',
      supersededBySelectionId: second.approval.id,
    });
    expect(second.superseded[0]!.supersededBySelectionId).not.toBe(first.approval.id);
  });

  it('leaves the replacement as the only current selection', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(30);
    await service.approve(project, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'Ada',
      supersedes: [concepts[0]!.id],
    });

    const summary = await service.getSummary(project, portrait());
    expect(summary.current.map((selection) => selection.assetId)).toEqual([concepts[1]!.id]);
    expect(summary.history).toHaveLength(3);
  });

  it('supersedes several approvals at once', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: costume(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[1]!.id, context: costume(), actor: 'Ada' });
    minutesLater(5);
    const chosen = await service.approve(project, {
      assetId: concepts[2]!.id,
      context: costume(),
      actor: 'Ada',
      supersedes: [concepts[0]!.id, concepts[1]!.id],
    });

    expect(chosen.superseded.map((selection) => selection.assetId).sort()).toEqual(
      [concepts[0]!.id, concepts[1]!.id].sort(),
    );
    expect((await service.getSummary(project, costume())).current).toHaveLength(1);
  });

  it('refuses to supersede something that was never the choice', async () => {
    await expect(
      service.approve(project, {
        assetId: concepts[1]!.id,
        context: portrait(),
        actor: 'Ada',
        supersedes: [concepts[0]!.id],
      }),
    ).rejects.toThrow(ConflictError);

    expect((await service.getSummary(project, portrait())).history).toEqual([]);
  });

  it('refuses to supersede an approval given for another purpose', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: costume(),
      actor: 'Ada',
    });
    minutesLater(5);

    await expect(
      service.approve(project, {
        assetId: concepts[1]!.id,
        context: portrait(),
        actor: 'Ada',
        supersedes: [concepts[0]!.id],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses an asset superseding itself', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(5);

    await expect(
      service.approve(project, {
        assetId: concepts[0]!.id,
        context: portrait(),
        actor: 'Ada',
        supersedes: [concepts[0]!.id],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('keeps a superseded asset inspectable, with its replacement named', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(30);
    const second = await service.approve(project, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'Ada',
      supersedes: [concepts[0]!.id],
    });

    const history = await service.listForAsset(project, concepts[0]!.id);
    expect(history.map((selection) => selection.state)).toEqual(['superseded', 'approved']);
    expect(history[0]!.supersededBySelectionId).toBe(second.approval.id);
  });
});

describe('what an entity currently stands behind', () => {
  it('reads every purpose in one go, newest first', async () => {
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(5);
    await service.approve(project, { assetId: concepts[1]!.id, context: costume(), actor: 'Ada' });

    const forDiver = await service.listForEntity(project, diver.id);
    expect(forDiver.map((selection) => selection.context.purpose)).toEqual(['costume', 'portrait']);
  });

  it('reads nothing for another entity', async () => {
    const wreck = await entities.insert(
      createEntity({ projectId: project, type: 'location', name: 'The Wreck' }, { clock, ids }),
    );
    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });

    expect(await service.listForEntity(project, wreck.id)).toEqual([]);
  });
});

describe('provenance', () => {
  /** The generation that produced `concepts[0]`, as the pipeline records it. */
  async function generationFor(asset: Asset): Promise<Generation> {
    const queued = await generations.insert(
      createGeneration(
        {
          projectId: project,
          capability: 'image.generate',
          prompt: 'A salvage diver, weathered helmet',
          inputAssetIds: [],
        },
        { clock, ids },
      ),
    );

    const running = dispatchGeneration(queued, { provider: 'openai', model: 'image-1' }, { clock });

    return generations.save(completeGeneration(running, { outputAssetIds: [asset.id] }, { clock }));
  }

  it('leaves the generation record exactly as it was through reject and supersede', async () => {
    const before = await generationFor(concepts[0]!);

    await service.approve(project, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'Ada',
    });
    minutesLater(30);
    await service.approve(project, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'Ada',
      supersedes: [concepts[0]!.id],
    });
    minutesLater(5);
    await service.reject(project, { assetId: concepts[0]!.id, context: costume(), actor: 'Ada' });

    expect(await generations.findById(project, before.id)).toEqual(before);
    expect(await assets.findById(project, concepts[0]!.id)).toEqual(concepts[0]);
  });
});
