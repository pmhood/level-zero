/**
 * The board's arithmetic, with no DOM and no React in it.
 *
 * The canvas is ordinary elements and pointer events, so every gesture ends up
 * as a sum: a pointer position in screen pixels becomes a position on the
 * board, a drag becomes a translation, a rotate handle becomes an angle. Those
 * sums are the part that is easy to get subtly wrong and easy to test, so they
 * live here rather than inside the event handlers that call them.
 *
 * Two conventions hold throughout:
 *
 * - **Board coordinates** are what the `moodboard_nodes` row stores. Screen
 *   coordinates are pixels relative to the canvas element's top-left corner.
 * - **Rotation is clockwise radians about a box's centre**, which is what a CSS
 *   `rotate()` with the default `transform-origin` does, so a node's stored
 *   `rotation` can be handed straight to the browser.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A node's placement: a rectangle that may be turned. */
export interface Box extends Rect {
  rotation: number;
}

/** Where the board sits under the canvas: a pan and a zoom, nothing else. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** No gesture may shrink a node past this, in board units. */
export const MIN_NODE_SIZE = 24;

/** Which part of a selection's frame a resize drag took hold of. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function toBoardPoint(screen: Point, viewport: Viewport): Point {
  return {
    x: (screen.x - viewport.x) / viewport.zoom,
    y: (screen.y - viewport.y) / viewport.zoom,
  };
}

export function toScreenPoint(board: Point, viewport: Viewport): Point {
  return {
    x: board.x * viewport.zoom + viewport.x,
    y: board.y * viewport.zoom + viewport.y,
  };
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/**
 * Zooms about a point on screen, so whatever is under the pointer stays under
 * it. Anchoring anywhere else makes a wheel zoom feel like the board is
 * sliding away.
 */
export function zoomViewportAt(viewport: Viewport, screen: Point, factor: number): Viewport {
  const zoom = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const applied = zoom / viewport.zoom;

  return {
    zoom,
    x: screen.x - (screen.x - viewport.x) * applied,
    y: screen.y - (screen.y - viewport.y) * applied,
  };
}

/**
 * The point two touches are pinching about: exactly between them, in
 * whichever coordinate space the two points share.
 */
export function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The viewport that shows all of `content` inside a canvas of `size`. */
export function fitViewport(
  content: Rect | null,
  size: { width: number; height: number },
  padding = 48,
): Viewport {
  if (!content || content.width <= 0 || content.height <= 0) return { x: 0, y: 0, zoom: 1 };

  const zoom = clamp(
    Math.min(
      (size.width - padding * 2) / content.width,
      (size.height - padding * 2) / content.height,
    ),
    MIN_ZOOM,
    1,
  );

  return {
    zoom,
    x: size.width / 2 - (content.x + content.width / 2) * zoom,
    y: size.height / 2 - (content.y + content.height / 2) * zoom,
  };
}

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** A rotated box's four corners, clockwise from the top-left of the unturned box. */
export function cornersOf(box: Box): Point[] {
  const centre = centerOf(box);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((offset) => translate(centre, rotate(offset, box.rotation)));
}

/**
 * The upright rectangle a rotated box occupies.
 *
 * Marquee selection is a rectangle test, and a tilted photograph still has to
 * be caught by a box drawn around its visible corners.
 */
export function boundsOf(box: Box): Rect {
  const corners = cornersOf(box);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return rectFromEdges(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

export function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;

  return rectFromEdges(
    Math.min(...rects.map((rect) => rect.x)),
    Math.min(...rects.map((rect) => rect.y)),
    Math.max(...rects.map((rect) => rect.x + rect.width)),
    Math.max(...rects.map((rect) => rect.y + rect.height)),
  );
}

/** The rectangle a drag from one point to another sweeps out. */
export function rectFromCorners(from: Point, to: Point): Rect {
  return rectFromEdges(
    Math.min(from.x, to.x),
    Math.min(from.y, to.y),
    Math.max(from.x, to.x),
    Math.max(from.y, to.y),
  );
}

/** Whether two upright rectangles overlap at all; touching edges do not count. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

/**
 * The rotation that puts a box's top edge under the pointer.
 *
 * The rotate handle hangs above the top edge, so pointing straight up at the
 * centre is zero and the angle grows clockwise, matching the stored field.
 */
export function rotationTowards(box: Box, pointer: Point): number {
  const centre = centerOf(box);
  return Math.atan2(pointer.y - centre.y, pointer.x - centre.x) + Math.PI / 2;
}

/**
 * Resizes a box by one handle, on a node that may already be rotated.
 *
 * The work is done in the box's own frame — the pointer is turned back by the
 * box's rotation, the dragged edges move, and the resulting rectangle is turned
 * forward again. That is what makes a corner handle on a tilted node pull along
 * the node's own diagonal instead of the screen's, and it keeps the edges the
 * drag did not touch exactly where they were on the board.
 */
export function resizeBox(box: Box, handle: ResizeHandle, pointer: Point): Box {
  const centre = centerOf(box);
  const local = rotate({ x: pointer.x - centre.x, y: pointer.y - centre.y }, -box.rotation);

  let left = -box.width / 2;
  let right = box.width / 2;
  let top = -box.height / 2;
  let bottom = box.height / 2;

  if (handle.includes('w')) left = Math.min(local.x, right - MIN_NODE_SIZE);
  if (handle.includes('e')) right = Math.max(local.x, left + MIN_NODE_SIZE);
  if (handle.includes('n')) top = Math.min(local.y, bottom - MIN_NODE_SIZE);
  if (handle.includes('s')) bottom = Math.max(local.y, top + MIN_NODE_SIZE);

  const width = right - left;
  const height = bottom - top;
  const shift = rotate({ x: (left + right) / 2, y: (top + bottom) / 2 }, box.rotation);

  return {
    x: centre.x + shift.x - width / 2,
    y: centre.y + shift.y - height / 2,
    width,
    height,
    rotation: box.rotation,
  };
}

function rotate(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function translate(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function rectFromEdges(left: number, top: number, right: number, bottom: number): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
