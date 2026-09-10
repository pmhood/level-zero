'use client';

import type { Asset, Entity, MoodboardConnector, MoodboardNode } from '@level-zero/domain';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

import { assetContentUrl } from '@/lib/api';

import { MoodboardCanvasProvider } from './moodboard-canvas-context';
import { MoodboardConnectorLayer } from './moodboard-connector-layer';
import { MoodboardTile } from './moodboard-node';
import { MoodboardSelection } from './moodboard-selection';
import { MoodboardToolbar, type MoodboardCanvasActions } from './moodboard-toolbar';
import {
  boundsOf,
  fitViewport,
  moveBox,
  panViewport,
  rectFromCorners,
  rectsIntersect,
  resizeBox,
  rotationTowards,
  toBoardPoint,
  unionOf,
  zoomViewportAt,
  type Box,
  type Point,
  type Rect,
  type ResizeHandle,
  type Viewport,
} from './moodboard-geometry';
import {
  drawnInZOrder,
  movedToEnd,
  pendingNodePatches,
  toSnapshot,
  type MoodboardNodeSnapshot,
} from './moodboard';

/** The board's grid step, in board units. */
const GRID_SIZE = 32;

/** A wheel notch reported in lines rather than pixels, in pixels. */
const LINE_HEIGHT = 16;

/** What the board is doing between a pointer going down and coming back up. */
type Gesture =
  | { kind: 'pan'; pointerId: number; origin: Point; viewport: Viewport }
  | { kind: 'marquee'; pointerId: number; origin: Point; additive: boolean }
  | { kind: 'move'; pointerId: number; boardOrigin: Point; boxes: ReadonlyMap<string, Box> }
  | { kind: 'resize'; pointerId: number; nodeId: string; handle: ResizeHandle; box: Box }
  | { kind: 'rotate'; pointerId: number; nodeId: string; box: Box };

export interface MoodboardCanvasProps {
  projectId: string;
  nodes: readonly MoodboardNode[];
  connectors: readonly MoodboardConnector[];
  entities: ReadonlyMap<string, Entity>;
  assets: ReadonlyMap<string, Asset>;
  actions: MoodboardCanvasActions;
  onSelectionChange: (nodeIds: readonly string[]) => void;
}

/**
 * The freeform board surface (design system spec §30).
 *
 * There is no canvas library under this: the board is one transformed container
 * of absolutely positioned elements, so the browser hit-tests tiles for free
 * and every tile is the same Tailwind-styled React as the rest of the app. The
 * interaction is pointer events over `moodboard-geometry`, and it persists
 * nothing of its own — a gesture in flight is a draft box, and the moment it
 * settles it is read back out as a patch to the stored node's named fields.
 */
export function MoodboardCanvas({
  projectId,
  nodes,
  connectors,
  entities,
  assets,
  actions,
  onSelectionChange,
}: MoodboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const spaceRef = useRef(false);

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Where a gesture has moved things so far. The stored nodes stay the truth;
  // a draft is what the person is looking at until the save comes back, and is
  // dropped again the moment the stored node agrees with it.
  const [drafts, setDraftsState] = useState<Record<string, Box>>({});
  const draftsRef = useRef(drafts);
  function setDrafts(next: Record<string, Box>) {
    draftsRef.current = next;
    setDraftsState(next);
  }

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const tiles = useMemo(() => drawnInZOrder(nodes), [nodes]);
  const groups = useMemo(() => nodes.filter((node) => node.type === 'group'), [nodes]);

  // Both maps are rebuilt only when the board changes, so a tile nobody is
  // dragging keeps the same props through a gesture and skips re-rendering.
  const storedBoxes = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            rotation: node.rotation,
          } satisfies Box,
        ]),
      ),
    [nodes],
  );
  const contents = useMemo(
    () => new Map(nodes.map((node) => [node.id, toSnapshot(node).content])),
    [nodes],
  );

  function boxOf(node: MoodboardNode): Box {
    return drafts[node.id] ?? storedBoxes.get(node.id)!;
  }

  /** Every tile the selection implies: a selected group stands for its members. */
  const selectedTileIds = useMemo(() => {
    const chosen = new Set(selection);
    return tiles.filter((node) => chosen.has(node.groupId ?? node.id)).map((node) => node.id);
  }, [selection, tiles]);

  const selectedNodeIds = useMemo(
    () => selection.filter((id) => isTile(byId.get(id))),
    [selection, byId],
  );
  const selectedGroupNodeIds = useMemo(
    () => selection.filter((id) => byId.get(id)?.type === 'group'),
    [selection, byId],
  );

  /** The one node whose own frame the resize and rotate handles belong to. */
  const reshapableNode = selection.length === 1 ? (byId.get(selection[0]!) ?? null) : null;
  const reshapable = isTile(reshapableNode) && !reshapableNode.locked;

  useEffect(() => {
    onSelectionChange(selectedNodeIds);
  }, [selectedNodeIds, onSelectionChange]);

  // A node that is gone is not selected, and a draft for it has nothing left to
  // settle against. A draft the stored node has caught up with is dropped too,
  // so a board reopened elsewhere is not held back by a gesture already saved.
  useEffect(() => {
    const present = new Set(nodes.map((node) => node.id));
    setSelection((current) =>
      current.every((id) => present.has(id)) ? current : current.filter((id) => present.has(id)),
    );

    const settled = Object.entries(draftsRef.current).filter(([id, box]) => {
      const node = byId.get(id);
      return node !== undefined && !isStored(node, box);
    });
    if (settled.length !== Object.keys(draftsRef.current).length) {
      setDrafts(Object.fromEntries(settled));
    }
  }, [nodes, byId]);

  // Fits the board into view once, when it opens. The canvas is keyed by board
  // id, so a different board is a different component and fits itself again.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const content = unionOf(
      drawnInZOrder(nodesRef.current).map((node) =>
        boundsOf({
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          rotation: node.rotation,
        }),
      ),
    );
    if (content) setViewport(fitViewport(content, { width, height }));
  }, []);

  // Wheel is a native listener because React's is passive: a passive handler
  // cannot stop the page scrolling, and a board that scrolls the page instead
  // of panning is unusable.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const point = screenPointIn(container, event);
      const scale = event.deltaMode === 1 ? LINE_HEIGHT : 1;

      // A trackpad pinch arrives as a wheel with `ctrlKey`; two fingers on the
      // same trackpad arrive without it and mean "move the board".
      if (event.ctrlKey || event.metaKey) {
        setViewport((current) =>
          zoomViewportAt(current, point, Math.exp((-event.deltaY * scale) / 100)),
        );
      } else {
        setViewport((current) =>
          panViewport(current, -event.deltaX * scale, -event.deltaY * scale),
        );
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Space is the pan modifier, so it is held rather than pressed. Taking it
  // globally is what makes it available wherever the pointer is, so it is given
  // up wherever it already means something: a space in the inspector's text
  // fields, and pressing whichever control has the keyboard's attention.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || spaceBelongsTo(event.target)) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    }

    // Never guarded: a key released somewhere else is still released, and a pan
    // modifier that stayed stuck down would take the board with it.
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /** Writes what the canvas is showing back as a change to the stored nodes. */
  function commit(ordered: readonly MoodboardNode[], applied: Record<string, Box>) {
    const patches = pendingNodePatches(
      nodes,
      ordered.map((node) => snapshotWith(node, applied[node.id])),
    );
    if (patches.length > 0) actions.updateNodes(patches);
  }

  function startGesture(event: PointerEvent<Element>, gesture: Gesture) {
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = gesture;
  }

  function onBackgroundPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const origin = screenPointIn(containerRef.current, event);

    if (event.button === 1 || spaceRef.current) {
      startGesture(event, { kind: 'pan', pointerId: event.pointerId, origin, viewport });
      return;
    }

    if (!event.shiftKey) setSelection([]);
    startGesture(event, {
      kind: 'marquee',
      pointerId: event.pointerId,
      origin,
      additive: event.shiftKey,
    });
  }

  function onTilePointerDown(event: PointerEvent<HTMLDivElement>, nodeId: string) {
    // Space still means pan, even with the pointer over a tile, so the event is
    // left to reach the background.
    if (event.button !== 0 || spaceRef.current) return;
    event.stopPropagation();

    const node = byId.get(nodeId);
    if (!node) return;

    const selectionId = node.groupId ?? node.id;
    const next = nextSelection(selection, selectionId, event.shiftKey);
    setSelection(next);

    const chosen = new Set(next);
    const moving = new Map(
      tiles
        .filter((tile) => !tile.locked && chosen.has(tile.groupId ?? tile.id))
        .map((tile) => [tile.id, boxOf(tile)] as const),
    );
    if (moving.size === 0) return;

    startGesture(event, {
      kind: 'move',
      pointerId: event.pointerId,
      boardOrigin: toBoardPoint(screenPointIn(containerRef.current, event), viewport),
      boxes: moving,
    });
  }

  // Stable across renders so a memoised tile is not re-rendered by a new
  // handler identity on every pointer move of a drag elsewhere on the board.
  const tilePointerDownRef = useRef(onTilePointerDown);
  tilePointerDownRef.current = onTilePointerDown;
  const tilePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, nodeId: string) =>
      tilePointerDownRef.current(event, nodeId),
    [],
  );

  function onHandlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    handle: ResizeHandle | 'rotate',
  ) {
    if (event.button !== 0 || !reshapableNode || !reshapable) return;
    event.stopPropagation();

    const box = boxOf(reshapableNode);
    startGesture(
      event,
      handle === 'rotate'
        ? { kind: 'rotate', pointerId: event.pointerId, nodeId: reshapableNode.id, box }
        : { kind: 'resize', pointerId: event.pointerId, nodeId: reshapableNode.id, handle, box },
    );
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const screen = screenPointIn(containerRef.current, event);
    const board = toBoardPoint(screen, viewportRef.current);

    switch (gesture.kind) {
      case 'pan':
        setViewport(
          panViewport(gesture.viewport, screen.x - gesture.origin.x, screen.y - gesture.origin.y),
        );
        return;
      case 'marquee':
        setMarquee(rectFromCorners(gesture.origin, screen));
        return;
      case 'move': {
        const dx = board.x - gesture.boardOrigin.x;
        const dy = board.y - gesture.boardOrigin.y;
        setDrafts({
          ...draftsRef.current,
          ...Object.fromEntries(
            [...gesture.boxes].map(([id, box]) => [id, moveBox(box, dx, dy)] as const),
          ),
        });
        return;
      }
      case 'resize':
        setDrafts({
          ...draftsRef.current,
          [gesture.nodeId]: resizeBox(gesture.box, gesture.handle, board),
        });
        return;
      case 'rotate':
        setDrafts({
          ...draftsRef.current,
          [gesture.nodeId]: { ...gesture.box, rotation: rotationTowards(gesture.box, board) },
        });
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;

    if (gesture.kind === 'marquee') {
      setMarquee(null);
      const screen = screenPointIn(containerRef.current, event);
      const swept = rectFromCorners(
        toBoardPoint(gesture.origin, viewport),
        toBoardPoint(screen, viewport),
      );
      // A locked tile is skipped: a marquee is a sweep of the board, and
      // sweeping up something deliberately pinned down is never what was meant.
      const caught = tiles
        .filter((tile) => !tile.locked && rectsIntersect(swept, boundsOf(boxOf(tile))))
        .map((tile) => tile.groupId ?? tile.id);
      setSelection(
        gesture.additive ? [...new Set([...selection, ...caught])] : [...new Set(caught)],
      );
      return;
    }

    if (gesture.kind !== 'pan') commit(tiles, draftsRef.current);
  }

  function setLocked(locked: boolean) {
    actions.updateNodes(selectedTileIds.map((id) => ({ id, locked })));
  }

  function reorder(end: 'front' | 'back') {
    commit(movedToEnd(tiles, new Set(selectedTileIds), end), drafts);
  }

  const selectionBounds = unionOf(selectedTileIds.map((id) => boundsOf(boxOf(byId.get(id)!))));
  const selectionBox: Box | null =
    reshapable && reshapableNode
      ? boxOf(reshapableNode)
      : selectionBounds && { ...selectionBounds, rotation: 0 };

  // The connector layer draws from node bounds, so it is given the board as the
  // canvas is showing it: a line follows the tile someone is dragging.
  const context = useMemo(
    () => ({
      projectId,
      nodes: nodes.map((node) => (drafts[node.id] ? { ...node, ...drafts[node.id]! } : node)),
      connectors,
      entities,
      assets,
      assetSrc: assetContentUrl,
    }),
    [projectId, nodes, drafts, connectors, entities, assets],
  );

  return (
    <div
      ref={containerRef}
      data-testid="moodboard-canvas"
      className="relative min-h-0 flex-1 touch-none overflow-hidden bg-board"
      style={{ cursor: spaceHeld ? 'grab' : 'default' }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <MoodboardGrid viewport={viewport} />

      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        <MoodboardCanvasProvider value={context}>
          {groups.map((group) => (
            <MoodboardGroupFrame
              key={group.id}
              bounds={unionOf(
                tiles
                  .filter((tile) => tile.groupId === group.id)
                  .map((tile) => boundsOf(boxOf(tile))),
              )}
            />
          ))}

          <MoodboardConnectorLayer />

          {tiles.map((node, index) => (
            <MoodboardTile
              key={node.id}
              nodeId={node.id}
              content={contents.get(node.id)!}
              box={boxOf(node)}
              zIndex={index + 1}
              locked={node.locked}
              onPointerDown={tilePointerDown}
            />
          ))}

          {selectionBox && (
            <MoodboardSelection
              box={selectionBox}
              zoom={viewport.zoom}
              zIndex={tiles.length + 1}
              reshapable={reshapable}
              onHandlePointerDown={onHandlePointerDown}
            />
          )}
        </MoodboardCanvasProvider>
      </div>

      {marquee && (
        <div
          className="pointer-events-none absolute z-40 border border-primary bg-primary/10"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}

      <MoodboardToolbar
        actions={actions}
        selectedNodeIds={selectedNodeIds}
        selectedGroupNodeIds={selectedGroupNodeIds}
        allLocked={
          selectedTileIds.length > 0 && selectedTileIds.every((id) => byId.get(id)?.locked)
        }
        onSetLocked={setLocked}
        onReorder={reorder}
        onClearSelection={() => setSelection([])}
      />
    </div>
  );
}

/** A group is the space its members take up, drawn so it can be seen as one. */
function MoodboardGroupFrame({ bounds }: { bounds: Rect | null }) {
  if (!bounds) return null;

  const padding = 8;
  return (
    <div
      className="pointer-events-none absolute rounded-lg border border-dashed border-border-strong"
      style={{
        left: bounds.x - padding,
        top: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      }}
    />
  );
}

/**
 * The board's grid: faint lines rather than the bright dots of a diagramming
 * tool (design system spec §30 — 3–6% opacity, no Figma-style dotted grid).
 */
function MoodboardGrid({ viewport }: { viewport: Viewport }) {
  const step = GRID_SIZE * viewport.zoom;
  if (step < 8) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 size-full text-white/[0.05]" aria-hidden>
      <defs>
        <pattern
          id="lz-moodboard-grid"
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
          x={viewport.x}
          y={viewport.y}
        >
          <path
            d={`M ${step} 0 L 0 0 0 ${step}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lz-moodboard-grid)" />
    </svg>
  );
}

/** The tile as it is being drawn, which mid-gesture is not what is stored. */
function snapshotWith(node: MoodboardNode, box: Box | undefined): MoodboardNodeSnapshot {
  const snapshot = toSnapshot(node);
  if (!box) return snapshot;

  return {
    ...snapshot,
    x: box.x,
    y: box.y,
    rotation: box.rotation,
    content: { ...snapshot.content, w: box.width, h: box.height },
  };
}

function isStored(node: MoodboardNode, box: Box): boolean {
  return (
    node.x === box.x &&
    node.y === box.y &&
    node.width === box.width &&
    node.height === box.height &&
    node.rotation === box.rotation
  );
}

/** Group rows have no tile of their own, so they are never one. */
function isTile(node: MoodboardNode | null | undefined): node is MoodboardNode {
  return node != null && node.type !== 'group';
}

/** Shift adds to or removes from the selection; a plain click replaces it. */
function nextSelection(
  current: readonly string[],
  id: string,
  additive: boolean,
): readonly string[] {
  if (additive) {
    return current.includes(id) ? current.filter((other) => other !== id) : [...current, id];
  }
  return current.includes(id) ? current : [id];
}

function screenPointIn(
  container: HTMLElement | null,
  event: { clientX: number; clientY: number },
): Point {
  const rect = container?.getBoundingClientRect();
  return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
}

/**
 * What Space already means something to.
 *
 * A button is activated by Space, so swallowing the key for the whole window
 * would quietly take that away from anyone driving the board's own toolbar from
 * the keyboard — and a text field would stop being able to type a space.
 */
const SPACE_ACTIVATES =
  'input, textarea, select, button, a[href], [role="button"], [contenteditable="true"]';

function spaceBelongsTo(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SPACE_ACTIVATES) !== null;
}
