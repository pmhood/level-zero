// @vitest-environment jsdom
import type { MoodboardNode, MoodboardNodePatch } from '@level-zero/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MoodboardCanvas } from './moodboard-canvas';
import type { MoodboardCanvasActions } from './moodboard-toolbar';

vi.mock('@/lib/api', () => ({
  assetContentUrl: (projectId: string, assetId: string) => `/api/${projectId}/${assetId}`,
}));

beforeAll(() => {
  // jsdom has pointer events but not the capture that goes with them, and the
  // canvas takes capture on every gesture so a drag survives leaving the tile.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function node(overrides: Partial<MoodboardNode> = {}): MoodboardNode {
  return {
    id: 'node_1',
    projectId: 'prj_1',
    boardId: 'board_1',
    type: 'note',
    assetId: null,
    entityId: null,
    groupId: null,
    x: 0,
    y: 0,
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

let actions: MoodboardCanvasActions;
let selected: readonly string[];

beforeEach(() => {
  actions = {
    addNode: vi.fn(),
    updateNodes: vi.fn(),
    removeNodes: vi.fn(),
    duplicateNodes: vi.fn(),
    createGroup: vi.fn(),
    removeGroup: vi.fn(),
    connect: vi.fn(),
  };
  selected = [];
});

afterEach(cleanup);

function renderCanvas(nodes: readonly MoodboardNode[]) {
  render(
    <MoodboardCanvas
      projectId="prj_1"
      nodes={nodes}
      connectors={[]}
      entities={new Map()}
      assets={new Map()}
      actions={actions}
      onSelectionChange={(nodeIds) => {
        selected = nodeIds;
      }}
    />,
  );

  return screen.getByTestId('moodboard-canvas');
}

function tile(nodeId: string): HTMLElement {
  const element = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`No tile for ${nodeId}`);
  return element;
}

/** A press, a move and a release, which is every gesture the board has. */
function drag(from: HTMLElement, at: { x: number; y: number }, to: { x: number; y: number }) {
  const canvas = screen.getByTestId('moodboard-canvas');
  fireEvent.pointerDown(from, { pointerId: 1, button: 0, clientX: at.x, clientY: at.y });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: to.x, clientY: to.y });
}

/** Pressing a toolbar button, pointer event and all, as a browser would. */
function press(name: string) {
  const button = screen.getByRole('button', { name });
  fireEvent.pointerDown(button, { pointerId: 2, button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerUp(button, { pointerId: 2, clientX: 0, clientY: 0 });
  fireEvent.click(button);
}

function patches(): MoodboardNodePatch[] {
  return vi.mocked(actions.updateNodes).mock.calls.flatMap(([given]) => [...given]);
}

/** Each separate call to `updateNodes`, patches still grouped by call. */
function calls(): MoodboardNodePatch[][] {
  return vi.mocked(actions.updateNodes).mock.calls.map(([given]) => [...given]);
}

describe('drawing the board', () => {
  it('draws a tile per node, back to front', () => {
    renderCanvas([node({ id: 'front', zOrder: 5 }), node({ id: 'back', zOrder: 1 })]);

    expect(tile('back').style.zIndex).toBe('1');
    expect(tile('front').style.zIndex).toBe('2');
  });

  it('draws a group as a frame rather than as a tile of its own', () => {
    renderCanvas([
      node({ id: 'group_1', type: 'group' }),
      node({ id: 'node_1', groupId: 'group_1' }),
    ]);

    expect(document.querySelector('[data-node-id="group_1"]')).toBeNull();
    expect(tile('node_1')).toBeTruthy();
  });

  it('turns a rotated node with a CSS transform rather than redrawing it', () => {
    renderCanvas([node({ rotation: Math.PI / 4 })]);

    expect(tile('node_1').style.transform).toBe(`rotate(${Math.PI / 4}rad)`);
  });

  it('keeps the selection frame above every tile on a crowded board', () => {
    // Tiles are stacked by z-order in the same stacking context as the frame,
    // so a board with more tiles than the frame's z-index would bury it — and
    // whichever tile landed on top would take the presses meant for its handles.
    const crowd = Array.from({ length: 60 }, (_, index) =>
      node({ id: `node_${index}`, zOrder: index }),
    );
    renderCanvas(crowd);
    drag(tile('node_0'), { x: 0, y: 0 }, { x: 0, y: 0 });

    const frame = Number(screen.getByTestId('moodboard-selection').style.zIndex);
    const highest = Math.max(...crowd.map((given) => Number(tile(given.id).style.zIndex)));

    expect(highest).toBe(60);
    expect(frame).toBeGreaterThan(highest);
  });
});

describe('the space pan modifier', () => {
  it('takes Space when nothing is focused, and pans instead of moving a tile', () => {
    const canvas = renderCanvas([node()]);

    expect(fireEvent.keyDown(canvas, { code: 'Space' })).toBe(false);
    drag(tile('node_1'), { x: 0, y: 0 }, { x: 50, y: 20 });

    expect(actions.updateNodes).not.toHaveBeenCalled();
    expect(canvas.querySelector<HTMLElement>('[style*="scale"]')?.style.transform).toContain(
      'translate(50px, 20px)',
    );
  });

  it('leaves Space to a focused button, which is how a button is pressed', () => {
    renderCanvas([node()]);
    drag(tile('node_1'), { x: 0, y: 0 }, { x: 0, y: 0 });
    const button = screen.getByRole('button', { name: 'Front' });

    expect(fireEvent.keyDown(button, { code: 'Space' })).toBe(true);
  });

  it('lets go of the modifier even when the key is released elsewhere', () => {
    const canvas = renderCanvas([node()]);
    fireEvent.keyDown(canvas, { code: 'Space' });

    fireEvent.keyUp(document.body, { code: 'Space' });
    drag(tile('node_1'), { x: 0, y: 0 }, { x: 50, y: 20 });

    expect(patches()).toEqual([expect.objectContaining({ id: 'node_1', x: 50, y: 20 })]);
  });
});

describe('pinch zoom', () => {
  function transformOf(canvas: HTMLElement): string {
    return canvas.querySelector<HTMLElement>('[style*="scale"]')?.style.transform ?? '';
  }

  it('zooms about the midpoint of the two touches', () => {
    const canvas = renderCanvas([]);

    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 300, clientY: 100 });
    // Only the first finger moves; the second holds its touch-down position.
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 100 });

    expect(transformOf(canvas)).toBe('translate(-75px, -50px) scale(1.5)');

    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 300, clientY: 100 });
  });

  it('zooms rather than dragging a tile the pinch starts on', () => {
    renderCanvas([node()]);
    const canvas = screen.getByTestId('moodboard-canvas');

    fireEvent.pointerDown(tile('node_1'), { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 400, clientY: 50 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 400, clientY: 50 });

    expect(actions.updateNodes).not.toHaveBeenCalled();
    expect(tile('node_1').style.left).toBe('0px');
    expect(tile('node_1').style.top).toBe('0px');
  });

  it('ends cleanly when one finger lifts, without stranding the gesture or jumping the viewport', () => {
    const canvas = renderCanvas([]);

    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 100 });
    expect(transformOf(canvas)).toBe('translate(-75px, -50px) scale(1.5)');

    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 100 });
    // The still-down finger moving on its own must not resume the zoom.
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 500, clientY: 100 });

    expect(transformOf(canvas)).toBe('translate(-75px, -50px) scale(1.5)');
    expect(() =>
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 500, clientY: 100 }),
    ).not.toThrow();
  });
});

describe('selecting', () => {
  it('selects the tile that was pressed', () => {
    renderCanvas([node({ id: 'node_1' }), node({ id: 'node_2', x: 400 })]);

    drag(tile('node_2'), { x: 400, y: 0 }, { x: 400, y: 0 });

    expect(selected).toEqual(['node_2']);
    expect(screen.getByRole('toolbar', { name: 'Board selection' })).toBeTruthy();
  });

  it('selects a grouped tile as its group, so the group moves as one', () => {
    renderCanvas([
      node({ id: 'group_1', type: 'group' }),
      node({ id: 'node_1', groupId: 'group_1' }),
      node({ id: 'node_2', groupId: 'group_1', x: 300 }),
    ]);

    drag(tile('node_1'), { x: 0, y: 0 }, { x: 0, y: 0 });

    // The group is what is selected, so there is a group to break up and no
    // single node to duplicate.
    expect(selected).toEqual([]);
    expect(screen.getByRole('button', { name: 'Ungroup' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Duplicate' }).hasAttribute('disabled')).toBe(true);
  });

  it('sweeps up what a marquee crosses and leaves the rest', () => {
    const canvas = renderCanvas([node({ id: 'near' }), node({ id: 'far', x: 900, y: 900 })]);

    drag(canvas, { x: -10, y: -10 }, { x: 250, y: 250 });

    expect(selected).toEqual(['near']);
  });

  it('never sweeps up a locked tile', () => {
    const canvas = renderCanvas([node({ id: 'pinned', locked: true })]);

    drag(canvas, { x: -10, y: -10 }, { x: 250, y: 250 });

    expect(selected).toEqual([]);
  });

  it('clears the selection when the board itself is pressed', () => {
    const canvas = renderCanvas([node()]);
    drag(tile('node_1'), { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(selected).toEqual(['node_1']);

    drag(canvas, { x: 600, y: 600 }, { x: 600, y: 600 });

    expect(selected).toEqual([]);
  });
});

describe('moving', () => {
  it('writes a settled drag back as a change to x and y', () => {
    renderCanvas([node()]);

    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });

    expect(patches()).toEqual([expect.objectContaining({ id: 'node_1', x: 80, y: 30 })]);
  });

  it('shows the tile where it was dropped without waiting for the save', () => {
    renderCanvas([node()]);

    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });

    expect(tile('node_1').style.left).toBe('80px');
    expect(tile('node_1').style.top).toBe('30px');
  });

  it('moves every member of a group together', () => {
    renderCanvas([
      node({ id: 'group_1', type: 'group' }),
      node({ id: 'node_1', groupId: 'group_1' }),
      node({ id: 'node_2', groupId: 'group_1', x: 300, zOrder: 1 }),
    ]);

    drag(tile('node_1'), { x: 0, y: 0 }, { x: 50, y: 0 });

    expect(patches()).toEqual([
      expect.objectContaining({ id: 'node_1', x: 50 }),
      expect.objectContaining({ id: 'node_2', x: 350 }),
    ]);
  });

  it('will not move a locked tile', () => {
    renderCanvas([node({ locked: true })]);

    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });

    expect(actions.updateNodes).not.toHaveBeenCalled();
    expect(tile('node_1').style.left).toBe('0px');
  });

  it('says nothing changed when a press did not move anything', () => {
    renderCanvas([node()]);

    drag(tile('node_1'), { x: 10, y: 10 }, { x: 10, y: 10 });

    expect(actions.updateNodes).not.toHaveBeenCalled();
  });
});

describe('reshaping', () => {
  function select(nodeId: string) {
    drag(tile(nodeId), { x: 0, y: 0 }, { x: 0, y: 0 });
  }

  it('resizes from a corner handle', () => {
    renderCanvas([node()]);
    select('node_1');

    drag(screen.getByLabelText('Resize bottom right'), { x: 200, y: 200 }, { x: 260, y: 240 });

    expect(patches()).toEqual([
      expect.objectContaining({ id: 'node_1', x: 0, y: 0, width: 260, height: 240 }),
    ]);
  });

  it('resizes a rotated node along its own axes', () => {
    renderCanvas([node({ rotation: Math.PI / 2 })]);
    select('node_1');

    // A quarter turn points the node's east edge down the screen, so the
    // handle is dragged downwards to make the node wider.
    drag(screen.getByLabelText('Resize right'), { x: 100, y: 200 }, { x: 100, y: 250 });

    const [patch] = patches();
    expect(patch?.width).toBeCloseTo(250, 6);
    expect(patch?.height).toBeCloseTo(200, 6);
  });

  it('rotates from the rotate handle', () => {
    renderCanvas([node()]);
    select('node_1');

    // Pointing at the centre from due east is a quarter turn clockwise.
    drag(screen.getByLabelText('Rotate'), { x: 100, y: -28 }, { x: 400, y: 100 });

    expect(patches()[0]?.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('offers no handles on a locked tile', () => {
    renderCanvas([node({ locked: true })]);
    select('node_1');

    expect(screen.queryByLabelText('Rotate')).toBeNull();
  });
});

describe('ordering and locking', () => {
  function select(nodeId: string) {
    drag(tile(nodeId), { x: 0, y: 0 }, { x: 0, y: 0 });
  }

  it('renumbers z-order when a tile is brought to the front', () => {
    renderCanvas([node({ id: 'node_1', zOrder: 0 }), node({ id: 'node_2', x: 300, zOrder: 1 })]);
    select('node_1');

    press('Front');

    expect(patches()).toEqual([
      expect.objectContaining({ id: 'node_2', zOrder: 0 }),
      expect.objectContaining({ id: 'node_1', zOrder: 1 }),
    ]);
  });

  it('keeps the selection when a toolbar button is pressed', () => {
    renderCanvas([node()]);
    select('node_1');

    press('Front');

    expect(selected).toEqual(['node_1']);
    expect(screen.getByRole('toolbar', { name: 'Board selection' })).toBeTruthy();
  });

  it('locks the selection, and offers to unlock what is already locked', () => {
    const { rerender } = renderAndKeep([node()]);
    select('node_1');

    press('Lock');
    expect(patches()).toEqual([{ id: 'node_1', locked: true }]);

    rerender([node({ locked: true })]);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });
});

describe('undo/redo', () => {
  function select(nodeId: string) {
    drag(tile(nodeId), { x: 0, y: 0 }, { x: 0, y: 0 });
  }

  function undo(target: HTMLElement, meta = false) {
    fireEvent.keyDown(target, { key: 'z', ctrlKey: !meta, metaKey: meta });
  }

  function redo(target: HTMLElement, meta = false) {
    fireEvent.keyDown(target, { key: 'z', ctrlKey: !meta, metaKey: meta, shiftKey: true });
  }

  it('undoes and redoes a move', () => {
    const canvas = renderCanvas([node()]);
    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });

    undo(canvas);
    expect(calls()[1]).toEqual([expect.objectContaining({ id: 'node_1', x: 0, y: 0 })]);

    redo(canvas);
    expect(calls()[2]).toEqual([expect.objectContaining({ id: 'node_1', x: 80, y: 30 })]);
  });

  it('undoes a resize back to the pre-gesture box', () => {
    const canvas = renderCanvas([node()]);
    select('node_1');
    drag(screen.getByLabelText('Resize bottom right'), { x: 200, y: 200 }, { x: 260, y: 240 });

    undo(canvas);
    expect(calls()[1]).toEqual([
      expect.objectContaining({ id: 'node_1', width: 200, height: 200 }),
    ]);
  });

  it('undoes a rotation back to the pre-gesture angle', () => {
    const canvas = renderCanvas([node()]);
    select('node_1');
    drag(screen.getByLabelText('Rotate'), { x: 100, y: -28 }, { x: 400, y: 100 });

    undo(canvas);
    expect(calls()[1]?.[0]?.rotation).toBe(0);
  });

  it('undoes a front/back z-order change', () => {
    const canvas = renderCanvas([
      node({ id: 'node_1', zOrder: 0 }),
      node({ id: 'node_2', x: 300, zOrder: 1 }),
    ]);
    select('node_1');
    press('Front');

    undo(canvas);
    expect(calls()[1]).toEqual([
      expect.objectContaining({ id: 'node_2', zOrder: 1 }),
      expect.objectContaining({ id: 'node_1', zOrder: 0 }),
    ]);
  });

  it('undoes a lock toggle', () => {
    const canvas = renderCanvas([node()]);
    select('node_1');
    press('Lock');
    expect(calls()[0]).toEqual([{ id: 'node_1', locked: true }]);

    undo(canvas);
    expect(calls()[1]).toEqual([{ id: 'node_1', locked: false }]);
  });

  it('undoes a multi-selection move as one step, not one per node', () => {
    const canvas = renderCanvas([
      node({ id: 'group_1', type: 'group' }),
      node({ id: 'node_1', groupId: 'group_1' }),
      node({ id: 'node_2', groupId: 'group_1', x: 300, zOrder: 1 }),
    ]);
    drag(tile('node_1'), { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(calls()[0]).toHaveLength(2);

    undo(canvas);

    expect(calls()).toHaveLength(2); // one commit, one undo — not one undo per node
    expect(calls()[1]).toEqual([
      expect.objectContaining({ id: 'node_1', x: 0 }),
      expect.objectContaining({ id: 'node_2', x: 300 }),
    ]);
  });

  it('works with the macOS Cmd chord as well as Ctrl', () => {
    const canvas = renderCanvas([node()]);
    select('node_1');
    press('Lock');

    undo(canvas, true);
    expect(calls()[1]).toEqual([{ id: 'node_1', locked: false }]);

    redo(canvas, true);
    expect(calls()[2]).toEqual([{ id: 'node_1', locked: true }]);
  });

  it('discards the redo stack once a fresh operation commits', () => {
    const canvas = renderCanvas([node()]);
    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });
    undo(canvas);
    drag(tile('node_1'), { x: 10, y: 10 }, { x: 95, y: 45 });
    expect(calls()).toHaveLength(3);

    redo(canvas);

    expect(calls()).toHaveLength(3); // nothing left to redo
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const canvas = renderCanvas([node()]);

    undo(canvas);
    redo(canvas);

    expect(actions.updateNodes).not.toHaveBeenCalled();
  });

  it('does not fire while a text field has focus', () => {
    renderCanvas([node()]);
    drag(tile('node_1'), { x: 10, y: 10 }, { x: 90, y: 40 });

    const input = document.createElement('input');
    document.body.appendChild(input);

    // A key event not swallowed here reaches the field to type with, same as
    // the space-pan modifier already leaves a focused control alone.
    expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true);
    expect(calls()).toHaveLength(1); // only the drag's own commit
  });
});

/** Rendering with a way to hand the canvas a changed board, as a save would. */
function renderAndKeep(nodes: readonly MoodboardNode[]) {
  function canvas(given: readonly MoodboardNode[]) {
    return (
      <MoodboardCanvas
        projectId="prj_1"
        nodes={given}
        connectors={[]}
        entities={new Map()}
        assets={new Map()}
        actions={actions}
        onSelectionChange={(nodeIds) => {
          selected = nodeIds;
        }}
      />
    );
  }

  const view = render(canvas(nodes));
  return { rerender: (given: readonly MoodboardNode[]) => view.rerender(canvas(given)) };
}
