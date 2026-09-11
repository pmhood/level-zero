import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  createAssetSelection,
  currentAssetSelections,
  currentAssetSelectionsByPurpose,
  latestSelectionByAsset,
  sameAssetSelectionContext,
  type AssetSelection,
  type AssetSelectionState,
} from './asset-selection';

const deps = { clock: fixedClock('2026-03-01T09:00:00.000Z'), ids: sequentialIdGenerator('sel') };

const portraitContext = { entityId: 'character-1', purpose: 'portrait' };

function decided(
  assetId: string,
  state: AssetSelectionState,
  instant: string,
  overrides: Partial<AssetSelection> = {},
): AssetSelection {
  return {
    id: `${assetId}-${state}-${instant}`,
    projectId: 'project-1',
    assetId,
    context: portraitContext,
    state,
    actor: 'Ada',
    note: null,
    supersededBySelectionId: null,
    decidedAt: new Date(instant),
    ...overrides,
  };
}

/** Newest first, the order every repository read of these rows promises. */
function newestFirst(selections: readonly AssetSelection[]): AssetSelection[] {
  return [...selections].sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
}

describe('creating an asset selection', () => {
  it('records the choice, who made it and what it was for', () => {
    const selection = createAssetSelection(
      {
        projectId: 'project-1',
        assetId: 'asset-1',
        context: portraitContext,
        state: 'approved',
        actor: 'Ada',
        note: 'The silhouette reads at thumbnail size.',
      },
      deps,
    );

    expect(selection).toMatchObject({
      id: 'sel-1',
      assetId: 'asset-1',
      context: { entityId: 'character-1', purpose: 'portrait' },
      state: 'approved',
      actor: 'Ada',
      note: 'The silhouette reads at thumbnail size.',
      supersededBySelectionId: null,
    });
    expect(selection.decidedAt).toEqual(new Date('2026-03-01T09:00:00.000Z'));
  });

  it('refuses a decision nobody is named for', () => {
    expect(() =>
      createAssetSelection(
        {
          projectId: 'project-1',
          assetId: 'asset-1',
          context: portraitContext,
          state: 'approved',
          actor: '  ',
        },
        deps,
      ),
    ).toThrow(ValidationError);
  });

  it('refuses an approval that does not say what it is for', () => {
    expect(() =>
      createAssetSelection(
        {
          projectId: 'project-1',
          assetId: 'asset-1',
          context: { entityId: 'character-1', purpose: '' },
          state: 'approved',
          actor: 'Ada',
        },
        deps,
      ),
    ).toThrow(ValidationError);
  });

  it('refuses a state outside the selection vocabulary', () => {
    expect(() =>
      createAssetSelection(
        {
          projectId: 'project-1',
          assetId: 'asset-1',
          context: portraitContext,
          state: 'shortlisted' as AssetSelectionState,
          actor: 'Ada',
        },
        deps,
      ),
    ).toThrow(ValidationError);
  });
});

describe('comparing contexts', () => {
  it('separates two purposes for the same entity', () => {
    expect(
      sameAssetSelectionContext(portraitContext, { entityId: 'character-1', purpose: 'costume' }),
    ).toBe(false);
  });

  it('separates the same purpose for two entities', () => {
    expect(
      sameAssetSelectionContext(portraitContext, { entityId: 'character-2', purpose: 'portrait' }),
    ).toBe(false);
  });

  it('matches an identical context', () => {
    expect(sameAssetSelectionContext(portraitContext, { ...portraitContext })).toBe(true);
  });
});

describe('reading where a context stands', () => {
  it('has no current selection before anybody chooses', () => {
    expect(currentAssetSelections([])).toEqual([]);
  });

  it('keeps every asset still approved, because a context can hold more than one', () => {
    const history = newestFirst([
      decided('asset-1', 'approved', '2026-03-01T09:00:00.000Z'),
      decided('asset-2', 'approved', '2026-03-01T10:00:00.000Z'),
    ]);

    expect(currentAssetSelections(history).map((selection) => selection.assetId)).toEqual([
      'asset-2',
      'asset-1',
    ]);
  });

  it('reads only the newest decision about each asset', () => {
    const history = newestFirst([
      decided('asset-1', 'approved', '2026-03-01T09:00:00.000Z'),
      decided('asset-1', 'rejected', '2026-03-02T09:00:00.000Z'),
    ]);

    expect(currentAssetSelections(history)).toEqual([]);
    expect(latestSelectionByAsset(history).get('asset-1')?.state).toBe('rejected');
  });

  it('never brings an older approval back once a newer decision has replaced it', () => {
    const history = newestFirst([
      decided('asset-1', 'approved', '2026-03-01T09:00:00.000Z'),
      decided('asset-1', 'superseded', '2026-03-02T09:00:00.000Z', {
        supersededBySelectionId: 'sel-9',
      }),
      decided('asset-1', 'rejected', '2026-03-03T09:00:00.000Z'),
    ]);

    expect(currentAssetSelections(history)).toEqual([]);
  });

  it('leaves a superseded asset out of the current selection but not out of the history', () => {
    const history = newestFirst([
      decided('asset-1', 'approved', '2026-03-01T09:00:00.000Z'),
      decided('asset-1', 'superseded', '2026-03-02T09:00:00.000Z', {
        supersededBySelectionId: 'sel-9',
      }),
      decided('asset-2', 'approved', '2026-03-02T09:00:00.000Z'),
    ]);

    expect(currentAssetSelections(history).map((selection) => selection.assetId)).toEqual([
      'asset-2',
    ]);
    expect(history).toHaveLength(3);
    expect(latestSelectionByAsset(history).get('asset-1')?.supersededBySelectionId).toBe('sel-9');
  });
});

describe('reading what an entity stands behind, across purposes', () => {
  const forPurpose = (
    assetId: string,
    purpose: string,
    state: AssetSelectionState,
    instant: string,
  ) => decided(assetId, state, instant, { context: { entityId: 'character-1', purpose } });

  it('has nothing to show before anybody chooses', () => {
    expect(currentAssetSelectionsByPurpose([])).toEqual(new Map());
  });

  it('groups the approved assets by what each was approved for', () => {
    const history = newestFirst([
      forPurpose('asset-1', 'portrait', 'approved', '2026-03-01T09:00:00.000Z'),
      forPurpose('asset-2', 'costume', 'approved', '2026-03-02T09:00:00.000Z'),
      forPurpose('asset-3', 'costume', 'approved', '2026-03-03T09:00:00.000Z'),
    ]);

    const byPurpose = currentAssetSelectionsByPurpose(history);
    expect([...byPurpose.keys()].sort()).toEqual(['costume', 'portrait']);
    expect(byPurpose.get('portrait')?.map((selection) => selection.assetId)).toEqual(['asset-1']);
    expect(
      byPurpose
        .get('costume')
        ?.map((selection) => selection.assetId)
        .sort(),
    ).toEqual(['asset-2', 'asset-3']);
  });

  it('folds each purpose separately, so one asset can be kept for one and turned down for another', () => {
    const history = newestFirst([
      forPurpose('asset-1', 'portrait', 'approved', '2026-03-01T09:00:00.000Z'),
      forPurpose('asset-1', 'costume', 'rejected', '2026-03-02T09:00:00.000Z'),
    ]);

    const byPurpose = currentAssetSelectionsByPurpose(history);
    expect(byPurpose.get('portrait')?.map((selection) => selection.assetId)).toEqual(['asset-1']);
    expect(byPurpose.has('costume')).toBe(false);
  });

  it('does not let a decision in one purpose overrule the same asset in another', () => {
    // The newest decision about asset-1 anywhere is the costume rejection, and
    // it must not reach back into the portrait it is still approved as.
    const history = newestFirst([
      forPurpose('asset-1', 'portrait', 'approved', '2026-03-03T09:00:00.000Z'),
      forPurpose('asset-1', 'costume', 'approved', '2026-03-01T09:00:00.000Z'),
      forPurpose('asset-1', 'costume', 'rejected', '2026-03-04T09:00:00.000Z'),
    ]);

    expect(currentAssetSelectionsByPurpose(history).get('portrait')).toHaveLength(1);
  });

  it('leaves out a purpose whose only choice was superseded', () => {
    const history = newestFirst([
      forPurpose('asset-1', 'portrait', 'approved', '2026-03-01T09:00:00.000Z'),
      {
        ...forPurpose('asset-1', 'portrait', 'superseded', '2026-03-02T09:00:00.000Z'),
        supersededBySelectionId: 'sel-9',
      },
    ]);

    expect(currentAssetSelectionsByPurpose(history).has('portrait')).toBe(false);
  });

  it('keeps a purpose whose label contains separators, spaces and punctuation', () => {
    // The purpose is a caller-supplied label, so nothing here may treat any
    // character in it as a delimiter.
    const awkward = 'costume\u0000 / sheet:2';
    const history = newestFirst([
      forPurpose('asset-1', awkward, 'approved', '2026-03-01T09:00:00.000Z'),
      forPurpose('asset-2', 'costume', 'approved', '2026-03-02T09:00:00.000Z'),
    ]);

    const byPurpose = currentAssetSelectionsByPurpose(history);
    expect(byPurpose.get(awkward)?.map((selection) => selection.assetId)).toEqual(['asset-1']);
    expect(byPurpose.get('costume')?.map((selection) => selection.assetId)).toEqual(['asset-2']);
  });
});
