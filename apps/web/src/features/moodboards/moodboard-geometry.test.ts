import { describe, expect, it } from 'vitest';

import {
  boundsOf,
  centerOf,
  cornersOf,
  fitViewport,
  MIN_NODE_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  midpointOf,
  moveBox,
  panViewport,
  rectFromCorners,
  rectsIntersect,
  resizeBox,
  rotationTowards,
  toBoardPoint,
  toScreenPoint,
  unionOf,
  zoomViewportAt,
  type Box,
} from './moodboard-geometry';

function box(overrides: Partial<Box> = {}): Box {
  return { x: 100, y: 100, width: 200, height: 100, rotation: 0, ...overrides };
}

/** Comparing floats that have been through a sine and back. */
function closeTo(value: number) {
  return expect.closeTo(value, 6);
}

describe('coordinate conversion', () => {
  it('round-trips a point at an awkward zoom', () => {
    const viewport = { x: -37, y: 214, zoom: 0.37 };
    const board = toBoardPoint({ x: 640, y: 480 }, viewport);

    expect(toScreenPoint(board, viewport).x).toEqual(closeTo(640));
    expect(toScreenPoint(board, viewport).y).toEqual(closeTo(480));
  });

  it('reads the same board point wherever the board has been panned to', () => {
    const before = toBoardPoint({ x: 200, y: 200 }, { x: 0, y: 0, zoom: 2 });
    const after = toBoardPoint({ x: 260, y: 180 }, panViewport({ x: 0, y: 0, zoom: 2 }, 60, -20));

    expect(after).toEqual(before);
  });
});

describe('zoomViewportAt', () => {
  it('keeps whatever is under the pointer under the pointer', () => {
    const viewport = { x: 40, y: -15, zoom: 0.8 };
    const pointer = { x: 300, y: 220 };
    const before = toBoardPoint(pointer, viewport);

    const after = toBoardPoint(pointer, zoomViewportAt(viewport, pointer, 1.6));

    expect(after.x).toEqual(closeTo(before.x));
    expect(after.y).toEqual(closeTo(before.y));
  });

  it('will not zoom past its limits', () => {
    expect(zoomViewportAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomViewportAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM);
  });
});

describe('midpointOf', () => {
  it('is exactly between two points', () => {
    expect(midpointOf({ x: 100, y: 40 }, { x: 300, y: 120 })).toEqual({ x: 200, y: 80 });
  });
});

describe('pinch zoom', () => {
  it('keeps the midpoint of the two touches over the same board point as they spread', () => {
    const viewport = { x: 40, y: -15, zoom: 0.8 };
    const a = { x: 260, y: 200 };
    const b = { x: 340, y: 240 };
    const before = toBoardPoint(midpointOf(a, b), viewport);

    const after = toBoardPoint(midpointOf(a, b), zoomViewportAt(viewport, midpointOf(a, b), 1.6));

    expect(after.x).toEqual(closeTo(before.x));
    expect(after.y).toEqual(closeTo(before.y));
  });
});

describe('fitViewport', () => {
  it('centres the board in the canvas', () => {
    const viewport = fitViewport(
      { x: 0, y: 0, width: 400, height: 200 },
      { width: 1000, height: 600 },
    );
    const centre = toBoardPoint({ x: 500, y: 300 }, viewport);

    expect(centre.x).toEqual(closeTo(200));
    expect(centre.y).toEqual(closeTo(100));
  });

  it('shrinks a board that does not fit, but never enlarges a small one', () => {
    expect(
      fitViewport({ x: 0, y: 0, width: 4000, height: 200 }, { width: 1000, height: 600 }).zoom,
    ).toBeLessThan(1);
    expect(
      fitViewport({ x: 0, y: 0, width: 40, height: 20 }, { width: 1000, height: 600 }).zoom,
    ).toBe(1);
  });

  it('leaves an empty board where it is', () => {
    expect(fitViewport(null, { width: 1000, height: 600 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('boundsOf', () => {
  it('is the box itself when nothing is turned', () => {
    expect(boundsOf(box())).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('grows to hold a turned box, about its centre', () => {
    const bounds = boundsOf(box({ rotation: Math.PI / 2 }));

    expect(bounds.width).toEqual(closeTo(100));
    expect(bounds.height).toEqual(closeTo(200));
    expect(centerOf(bounds).x).toEqual(closeTo(200));
    expect(centerOf(bounds).y).toEqual(closeTo(150));
  });

  it('holds every corner of a box turned to an awkward angle', () => {
    const turned = box({ rotation: 0.7 });
    const bounds = boundsOf(turned);

    for (const corner of cornersOf(turned)) {
      expect(corner.x).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(corner.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9);
      expect(corner.y).toBeGreaterThanOrEqual(bounds.y - 1e-9);
      expect(corner.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-9);
    }
  });
});

describe('marquee selection', () => {
  it('sweeps a rectangle whichever way the drag went', () => {
    expect(rectFromCorners({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
  });

  it('catches a box it overlaps and misses one it does not', () => {
    const swept = { x: 0, y: 0, width: 150, height: 150 };

    expect(rectsIntersect(swept, boundsOf(box()))).toBe(true);
    expect(rectsIntersect(swept, boundsOf(box({ x: 400 })))).toBe(false);
  });

  it('catches a tilted box whose upright bounds reach into the sweep', () => {
    // The box starts 100 below the sweep; a quarter turn swings its corners up
    // to y=50 and into it.
    const swept = { x: 0, y: 0, width: 400, height: 80 };

    expect(rectsIntersect(swept, boundsOf(box()))).toBe(false);
    expect(rectsIntersect(swept, boundsOf(box({ rotation: Math.PI / 2 })))).toBe(true);
  });

  it('does not count a box that only touches the edge', () => {
    expect(rectsIntersect({ x: 0, y: 100, width: 100, height: 100 }, boundsOf(box()))).toBe(false);
  });
});

describe('unionOf', () => {
  it('is the space a group of boxes takes up together', () => {
    expect(unionOf([boundsOf(box()), boundsOf(box({ x: 400, y: 50 }))])).toEqual({
      x: 100,
      y: 50,
      width: 500,
      height: 150,
    });
  });

  it('is nothing at all when there is nothing in it', () => {
    expect(unionOf([])).toBeNull();
  });
});

describe('moveBox', () => {
  it('moves without reshaping', () => {
    expect(moveBox(box({ rotation: 0.3 }), -40, 10)).toEqual({
      x: 60,
      y: 110,
      width: 200,
      height: 100,
      rotation: 0.3,
    });
  });
});

describe('rotationTowards', () => {
  it('is zero with the pointer straight above the centre', () => {
    const turning = box();
    const centre = centerOf(turning);

    expect(rotationTowards(turning, { x: centre.x, y: centre.y - 200 })).toEqual(closeTo(0));
  });

  it('grows clockwise', () => {
    const turning = box();
    const centre = centerOf(turning);

    expect(rotationTowards(turning, { x: centre.x + 200, y: centre.y })).toEqual(
      closeTo(Math.PI / 2),
    );
  });
});

describe('resizeBox', () => {
  it('pulls one edge and leaves the opposite one alone', () => {
    const resized = resizeBox(box(), 'e', { x: 400, y: 0 });

    expect(resized).toMatchObject({ x: 100, y: 100, width: 300, height: 100 });
  });

  it('pulls a corner in both directions at once', () => {
    const resized = resizeBox(box(), 'nw', { x: 50, y: 60 });

    expect(resized).toMatchObject({ x: 50, y: 60, width: 250, height: 140 });
  });

  it('will not shrink a node into nothing', () => {
    const resized = resizeBox(box(), 'w', { x: 1000, y: 0 });

    expect(resized.width).toBe(MIN_NODE_SIZE);
    expect(resized.x + resized.width).toBe(300);
  });

  it("resizes a rotated node along its own axes, not the screen's", () => {
    // A quarter turn points the node's own east edge down the screen, so it is
    // dragging *downwards* that makes the node wider.
    const turned = box({ rotation: Math.PI / 2 });
    const resized = resizeBox(turned, 'e', { x: 200, y: 350 });

    expect(resized.width).toEqual(closeTo(300));
    expect(resized.height).toEqual(closeTo(100));
    expect(resized.rotation).toBe(turned.rotation);
  });

  it('keeps the untouched corner of a rotated node exactly where it was', () => {
    const turned = box({ rotation: Math.PI / 2 });
    const before = cornersOf(turned);

    // The south-east handle moves; the north-west corner is what it pulls from.
    const after = cornersOf(resizeBox(turned, 'se', { x: 120, y: 300 }));

    expect(after[0]!.x).toEqual(closeTo(before[0]!.x));
    expect(after[0]!.y).toEqual(closeTo(before[0]!.y));
  });

  it('puts the dragged corner of a rotated node under the pointer', () => {
    const turned = box({ rotation: Math.PI / 2 });
    const pointer = { x: 120, y: 300 };

    const corner = cornersOf(resizeBox(turned, 'se', pointer))[2]!;

    expect(corner.x).toEqual(closeTo(pointer.x));
    expect(corner.y).toEqual(closeTo(pointer.y));
  });
});
