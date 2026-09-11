import type { MoodboardNode } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  contentData,
  differsFromNode,
  drawnInZOrder,
  EMPTY_MOODBOARD_HISTORY,
  invertPatches,
  movedToEnd,
  pendingNodePatches,
  popRedo,
  popUndo,
  pushHistory,
  toNodePatch,
  toSnapshot,
  type MoodboardHistoryEntry,
  type MoodboardNodeSnapshot,
  type MoodboardPatchHistoryEntry,
} from './moodboard';

function node(overrides: Partial<MoodboardNode> = {}): MoodboardNode {
  return {
    id: 'node-1',
    projectId: 'prj-1',
    boardId: 'board-1',
    type: 'note',
    assetId: null,
    entityId: null,
    groupId: null,
    x: 10,
    y: 20,
    width: 200,
    height: 200,
    rotation: 0,
    zOrder: 0,
    locked: false,
    data: {},
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function snapshot(overrides: Partial<MoodboardNodeSnapshot> = {}): MoodboardNodeSnapshot {
  return {
    id: 'node-1',
    x: 10,
    y: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    content: {
      nodeType: 'note',
      w: 200,
      h: 200,
      assetId: null,
      entityId: null,
      text: '',
      url: '',
      colors: [],
    },
    ...overrides,
  };
}

describe('toSnapshot', () => {
  it('projects layout and reference onto the canvas', () => {
    const projected = toSnapshot(
      node({
        type: 'asset',
        assetId: 'asset-1',
        x: -40,
        y: 12,
        width: 320,
        height: 180,
        rotation: 0.5,
        locked: true,
      }),
    );

    expect(projected).toMatchObject({
      id: 'node-1',
      x: -40,
      y: 12,
      rotation: 0.5,
      locked: true,
      content: { nodeType: 'asset', w: 320, h: 180, assetId: 'asset-1', entityId: null },
    });
  });

  it('flattens the node data each kind actually draws', () => {
    expect(toSnapshot(node({ type: 'note', data: { text: 'colder' } })).content.text).toBe(
      'colder',
    );
    expect(
      toSnapshot(node({ type: 'link', data: { url: 'https://example.com' } })).content.url,
    ).toBe('https://example.com');
    expect(
      toSnapshot(node({ type: 'palette', data: { colors: ['#fff', '#000'] } })).content.colors,
    ).toEqual(['#fff', '#000']);
  });

  it('ignores data of the wrong shape rather than crashing on it', () => {
    const projected = toSnapshot(node({ data: { text: 42, colors: ['#fff', 7] } }));

    expect(projected.content.text).toBe('');
    expect(projected.content.colors).toEqual(['#fff']);
  });
});

describe('toNodePatch', () => {
  it('reads a placement back as named layout fields', () => {
    const patch = toNodePatch(
      snapshot({
        x: 500,
        y: -80,
        rotation: Math.PI / 2,
        content: { ...snapshot().content, w: 400, h: 300 },
      }),
      3,
      new Set(),
    );

    expect(patch).toMatchObject({
      id: 'node-1',
      x: 500,
      y: -80,
      width: 400,
      height: 300,
      rotation: Math.PI / 2,
      zOrder: 3,
      groupId: null,
    });
  });

  it('keeps a group that is still on the board', () => {
    const patch = toNodePatch(snapshot({ groupId: 'group-1' }), 0, new Set(['group-1']));

    expect(patch.groupId).toBe('group-1');
  });

  it('treats a group that is no longer on the board as no group', () => {
    const patch = toNodePatch(snapshot({ groupId: 'group-gone' }), 0, new Set(['group-1']));

    expect(patch.groupId).toBeNull();
  });

  it('carries a lock through', () => {
    expect(toNodePatch(snapshot({ locked: true }), 0, new Set()).locked).toBe(true);
  });
});

describe('contentData', () => {
  it('stores only what the node kind means', () => {
    const content = { ...snapshot().content, text: 'a', url: 'b', colors: ['#fff'] };

    expect(contentData({ ...content, nodeType: 'note' })).toEqual({ text: 'a' });
    expect(contentData({ ...content, nodeType: 'link' })).toEqual({ url: 'b', text: 'a' });
    expect(contentData({ ...content, nodeType: 'palette' })).toEqual({ colors: ['#fff'] });
    expect(contentData({ ...content, nodeType: 'asset' })).toEqual({});
  });

  it('leaves an untouched node with the empty data it was created with', () => {
    expect(contentData({ ...snapshot().content, nodeType: 'note' })).toEqual({});
    expect(contentData({ ...snapshot().content, nodeType: 'palette' })).toEqual({});
  });
});

describe('differsFromNode', () => {
  it('sees a move', () => {
    expect(differsFromNode(node(), toNodePatch(snapshot({ x: 11 }), 0, new Set()))).toBe(true);
  });

  it('says nothing changed when nothing changed', () => {
    expect(differsFromNode(node(), toNodePatch(snapshot(), 0, new Set()))).toBe(false);
  });

  it('does not mistake a re-ordered JSON object for an edit', () => {
    const stored = node({ type: 'link', data: { text: 'Ref', url: 'https://example.com' } });
    const patch = toNodePatch(
      snapshot({
        content: {
          ...snapshot().content,
          nodeType: 'link',
          text: 'Ref',
          url: 'https://example.com',
        },
      }),
      0,
      new Set(),
    );

    // Postgres hands `jsonb` back with its own key order; comparing the
    // stringified objects would report a change on every read.
    expect(Object.keys(patch.data ?? {})).not.toEqual(Object.keys(stored.data));
    expect(differsFromNode(stored, patch)).toBe(false);
  });
});

describe('pendingNodePatches', () => {
  it('reports only the nodes that actually moved', () => {
    const moved = node({ id: 'node-1' });
    const still = node({ id: 'node-2', x: 300, y: 300, zOrder: 1 });

    const patches = pendingNodePatches(
      [moved, still],
      [snapshot({ id: 'node-1', x: 999 }), snapshot({ id: 'node-2', x: 300, y: 300 })],
    );

    expect(patches.map((patch) => patch.id)).toEqual(['node-1']);
    expect(patches[0]?.x).toBe(999);
  });

  it('numbers z-order from the canvas order, back to front', () => {
    const first = node({ id: 'node-1', zOrder: 7 });
    const second = node({ id: 'node-2', zOrder: 9 });

    const patches = pendingNodePatches(
      [first, second],
      [snapshot({ id: 'node-2' }), snapshot({ id: 'node-1' })],
    );

    expect(patches).toEqual([
      expect.objectContaining({ id: 'node-2', zOrder: 0 }),
      expect.objectContaining({ id: 'node-1', zOrder: 1 }),
    ]);
  });

  it('ignores a tile whose node is no longer on the board', () => {
    const patches = pendingNodePatches([], [snapshot({ id: 'gone', x: 99 })]);

    expect(patches).toEqual([]);
  });

  it('records a node being put into a group', () => {
    const group = node({ id: 'group-1', type: 'group' });
    const member = node({ id: 'node-1' });

    const patches = pendingNodePatches(
      [group, member],
      [snapshot({ id: 'node-1', groupId: 'group-1' })],
    );

    expect(patches).toEqual([expect.objectContaining({ id: 'node-1', groupId: 'group-1' })]);
  });
});

describe('drawnInZOrder', () => {
  it('draws back to front and leaves group rows out', () => {
    const drawn = drawnInZOrder([
      node({ id: 'front', zOrder: 2 }),
      node({ id: 'group-1', type: 'group', zOrder: 1 }),
      node({ id: 'back', zOrder: 0 }),
    ]);

    expect(drawn.map((tile) => tile.id)).toEqual(['back', 'front']);
  });
});

describe('invertPatches', () => {
  it('restores only the fields the forward patch touched', () => {
    const stored = node({ x: 10, y: 20, locked: false });

    const inverse = invertPatches([stored], [{ id: 'node-1', x: 80, locked: true }]);

    expect(inverse).toEqual([{ id: 'node-1', x: 10, locked: false }]);
  });

  it('inverts a full layout patch back to the pre-gesture box', () => {
    const stored = node({ x: 10, y: 20, width: 200, height: 200, rotation: 0, zOrder: 0 });
    const patch = toNodePatch(snapshot({ x: 90, y: 40, rotation: Math.PI / 2 }), 3, new Set());

    expect(invertPatches([stored], [patch])).toEqual([
      expect.objectContaining({ id: 'node-1', x: 10, y: 20, width: 200, height: 200 }),
    ]);
    expect(invertPatches([stored], [patch])[0]?.rotation).toBe(0);
    expect(invertPatches([stored], [patch])[0]?.zOrder).toBe(0);
  });

  it('inverts a group patch back to no group', () => {
    const stored = node({ groupId: null });
    const patch = toNodePatch(snapshot({ groupId: 'group-1' }), 0, new Set(['group-1']));

    expect(invertPatches([stored], [patch]).map((p) => p.groupId)).toEqual([null]);
  });
});

describe('the history stack', () => {
  function entry(overrides: Partial<MoodboardPatchHistoryEntry> = {}): MoodboardPatchHistoryEntry {
    return {
      kind: 'patch',
      patches: [{ id: 'node-1', x: 80 }],
      inversePatches: [{ id: 'node-1', x: 10 }],
      ...overrides,
    };
  }

  /** These tests only ever push patch entries; the other kinds get their own suite below. */
  function asPatch(given: MoodboardHistoryEntry): MoodboardPatchHistoryEntry {
    if (given.kind !== 'patch') throw new Error(`Expected a patch entry, got ${given.kind}`);
    return given;
  }

  it('starts empty', () => {
    expect(EMPTY_MOODBOARD_HISTORY).toEqual({ undo: [], redo: [] });
  });

  it('records a pushed entry on the undo stack, on top of what was already there', () => {
    const history = pushHistory(
      pushHistory(EMPTY_MOODBOARD_HISTORY, entry()),
      entry({ patches: [{ id: 'node-2' }] }),
    );

    expect(history.undo.map((given) => asPatch(given).patches)).toEqual([
      [{ id: 'node-1', x: 80 }],
      [{ id: 'node-2' }],
    ]);
  });

  it('a fresh push discards whatever redo stack there was', () => {
    const undone = popUndo(pushHistory(EMPTY_MOODBOARD_HISTORY, entry()))!;
    expect(undone.history.redo).toHaveLength(1); // something to redo…

    const afterFreshChange = pushHistory(undone.history, entry({ patches: [{ id: 'node-2' }] }));
    expect(afterFreshChange.redo).toEqual([]); // …gone once a new change commits
  });

  it('moves an entry from undo to redo and back, applying the right side', () => {
    const history = pushHistory(EMPTY_MOODBOARD_HISTORY, entry());

    const undone = popUndo(history);
    expect(asPatch(undone!.entry).inversePatches).toEqual([{ id: 'node-1', x: 10 }]);
    expect(undone?.history).toEqual({ undo: [], redo: [entry()] });

    const redone = popRedo(undone!.history);
    expect(asPatch(redone!.entry).patches).toEqual([{ id: 'node-1', x: 80 }]);
    expect(redone?.history).toEqual({ undo: [entry()], redo: [] });
  });

  it('does nothing when a stack is empty', () => {
    expect(popUndo(EMPTY_MOODBOARD_HISTORY)).toBeNull();
    expect(popRedo(EMPTY_MOODBOARD_HISTORY)).toBeNull();
  });

  it('carries a create entry through undo and redo untouched by the patch-only helpers', () => {
    const created = pushHistory(EMPTY_MOODBOARD_HISTORY, {
      kind: 'create',
      nodes: [node({ id: 'node-9' })],
    });

    const undone = popUndo(created);
    expect(undone?.entry).toEqual({ kind: 'create', nodes: [node({ id: 'node-9' })] });
    expect(undone?.history).toEqual({ undo: [], redo: [created.undo[0]] });
  });

  it('carries a delete entry with the full removed nodes, not just their ids', () => {
    const removed = node({ id: 'node-9', x: 42, assetId: 'asset-1' });
    const history = pushHistory(EMPTY_MOODBOARD_HISTORY, { kind: 'delete', nodes: [removed] });

    const undone = popUndo(history);
    expect(undone?.entry).toEqual({ kind: 'delete', nodes: [removed] });
  });
});

describe('movedToEnd', () => {
  const ordered = [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })];

  it('brings a selection to the front, keeping its own order', () => {
    const moved = movedToEnd(ordered, new Set(['a', 'b']), 'front');

    expect(moved.map((tile) => tile.id)).toEqual(['c', 'a', 'b']);
  });

  it('sends a selection to the back', () => {
    expect(movedToEnd(ordered, new Set(['c']), 'back').map((tile) => tile.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('renumbers z-order from the resulting order', () => {
    const nodes = [
      node({ id: 'a', zOrder: 0 }),
      node({ id: 'b', zOrder: 1 }),
      node({ id: 'c', zOrder: 2 }),
    ];

    const patches = pendingNodePatches(
      nodes,
      movedToEnd(nodes, new Set(['c']), 'back').map(toSnapshot),
    );

    expect(patches).toEqual([
      expect.objectContaining({ id: 'c', zOrder: 0 }),
      expect.objectContaining({ id: 'a', zOrder: 1 }),
      expect.objectContaining({ id: 'b', zOrder: 2 }),
    ]);
  });
});
