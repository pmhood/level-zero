import type { MoodboardNode } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  contentData,
  differsFromNode,
  MOODBOARD_SHAPE_TYPE,
  nodeIdForShape,
  pendingNodePatches,
  shapeIdForNode,
  toNodePatch,
  toShape,
  type MoodboardShapeSnapshot,
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

function snapshot(overrides: Partial<MoodboardShapeSnapshot> = {}): MoodboardShapeSnapshot {
  return {
    id: 'shape:node-1',
    x: 10,
    y: 20,
    rotation: 0,
    isLocked: false,
    parentId: 'page:page',
    props: {
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

describe('shape ids', () => {
  it('round-trips a node id', () => {
    expect(nodeIdForShape(shapeIdForNode('node-1'))).toBe('node-1');
  });

  it('leaves an id that is not a shape id alone', () => {
    expect(nodeIdForShape('page:page')).toBe('page:page');
  });
});

describe('toShape', () => {
  it('projects layout and reference onto the canvas', () => {
    const projected = toShape(
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
      id: 'shape:node-1',
      type: MOODBOARD_SHAPE_TYPE,
      x: -40,
      y: 12,
      rotation: 0.5,
      isLocked: true,
      props: { nodeType: 'asset', w: 320, h: 180, assetId: 'asset-1', entityId: null },
    });
  });

  it('flattens the node data each kind actually draws', () => {
    expect(toShape(node({ type: 'note', data: { text: 'colder' } })).props.text).toBe('colder');
    expect(toShape(node({ type: 'link', data: { url: 'https://example.com' } })).props.url).toBe(
      'https://example.com',
    );
    expect(
      toShape(node({ type: 'palette', data: { colors: ['#fff', '#000'] } })).props.colors,
    ).toEqual(['#fff', '#000']);
  });

  it('ignores data of the wrong shape rather than crashing on it', () => {
    const projected = toShape(node({ data: { text: 42, colors: ['#fff', 7] } }));

    expect(projected.props.text).toBe('');
    expect(projected.props.colors).toEqual(['#fff']);
  });
});

describe('toNodePatch', () => {
  it('reads a transform back as named layout fields', () => {
    const patch = toNodePatch(
      snapshot({
        x: 500,
        y: -80,
        rotation: Math.PI / 2,
        props: { ...snapshot().props, w: 400, h: 300 },
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

  it('turns a parent that is a group node into a group id', () => {
    const patch = toNodePatch(snapshot({ parentId: 'shape:group-1' }), 0, new Set(['group-1']));

    expect(patch.groupId).toBe('group-1');
  });

  it('treats a parent that is not a group node as no group', () => {
    const patch = toNodePatch(snapshot({ parentId: 'page:page' }), 0, new Set(['group-1']));

    expect(patch.groupId).toBeNull();
  });

  it('carries a lock through', () => {
    expect(toNodePatch(snapshot({ isLocked: true }), 0, new Set()).locked).toBe(true);
  });
});

describe('contentData', () => {
  it('stores only what the node kind means', () => {
    const props = { ...snapshot().props, text: 'a', url: 'b', colors: ['#fff'] };

    expect(contentData({ ...props, nodeType: 'note' })).toEqual({ text: 'a' });
    expect(contentData({ ...props, nodeType: 'link' })).toEqual({ url: 'b', text: 'a' });
    expect(contentData({ ...props, nodeType: 'palette' })).toEqual({ colors: ['#fff'] });
    expect(contentData({ ...props, nodeType: 'asset' })).toEqual({});
  });

  it('leaves an untouched node with the empty data it was created with', () => {
    expect(contentData({ ...snapshot().props, nodeType: 'note' })).toEqual({});
    expect(contentData({ ...snapshot().props, nodeType: 'palette' })).toEqual({});
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
        props: { ...snapshot().props, nodeType: 'link', text: 'Ref', url: 'https://example.com' },
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
      [snapshot({ id: 'shape:node-1', x: 999 }), snapshot({ id: 'shape:node-2', x: 300, y: 300 })],
    );

    expect(patches.map((patch) => patch.id)).toEqual(['node-1']);
    expect(patches[0]?.x).toBe(999);
  });

  it('numbers z-order from the canvas order, back to front', () => {
    const first = node({ id: 'node-1', zOrder: 7 });
    const second = node({ id: 'node-2', zOrder: 9 });

    const patches = pendingNodePatches(
      [first, second],
      [snapshot({ id: 'shape:node-2' }), snapshot({ id: 'shape:node-1' })],
    );

    expect(patches).toEqual([
      expect.objectContaining({ id: 'node-2', zOrder: 0 }),
      expect.objectContaining({ id: 'node-1', zOrder: 1 }),
    ]);
  });

  it('ignores a shape whose node is no longer on the board', () => {
    const patches = pendingNodePatches([], [snapshot({ id: 'shape:gone', x: 99 })]);

    expect(patches).toEqual([]);
  });

  it('records a node being put into a group', () => {
    const group = node({ id: 'group-1', type: 'group' });
    const member = node({ id: 'node-1' });

    const patches = pendingNodePatches(
      [group, member],
      [snapshot({ id: 'shape:node-1', parentId: 'shape:group-1' })],
    );

    expect(patches).toEqual([expect.objectContaining({ id: 'node-1', groupId: 'group-1' })]);
  });
});
