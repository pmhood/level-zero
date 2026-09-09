'use client';

import type { Asset, Entity, MoodboardConnector, MoodboardNode } from '@level-zero/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Tldraw,
  createShapeId,
  type Editor,
  type TLComponents,
  type TLGridProps,
  type TLShape,
  type TLShapeId,
} from 'tldraw';
import 'tldraw/tldraw.css';

import { assetContentUrl } from '@/lib/api';

import { MoodboardConnectorLayer } from './moodboard-connector-layer';
import { MoodboardCanvasProvider } from './moodboard-canvas-context';
import { MoodboardShapeUtil, type MoodboardShape } from './moodboard-shape';
import { MoodboardToolbar, type MoodboardCanvasActions } from './moodboard-toolbar';
import {
  MOODBOARD_SHAPE_TYPE,
  nodeIdForShape,
  pendingNodePatches,
  shapeIdForNode,
  toShape,
  type MoodboardShapeSnapshot,
} from './moodboard';

/** How long a drag settles before its layout is written back. */
const SAVE_DEBOUNCE_MS = 500;

const SHAPE_UTILS = [MoodboardShapeUtil];

// tldraw recreates its editor when these change identity, so they are defined
// once here and read what they need from the canvas context instead.
const COMPONENTS: TLComponents = {
  Background: MoodboardBackground,
  Grid: MoodboardGrid,
  OnTheCanvas: MoodboardConnectorLayer,
};

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
 * tldraw supplies the interaction — pan, zoom, drag, resize, rotate, marquee
 * select, group — and nothing else: it is seeded from the stored nodes when the
 * board opens or its contents change, and every settled gesture is read back
 * out as a layout change to those same rows. No tldraw snapshot is persisted,
 * so the board model stays the repository's rather than the library's.
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const context = useMemo(
    () => ({ projectId, nodes, connectors, entities, assets, assetSrc: assetContentUrl }),
    [projectId, nodes, connectors, entities, assets],
  );

  const save = useCallback(() => {
    if (!editor) return;
    const patches = pendingNodePatches(nodesRef.current, readSnapshots(editor));
    if (patches.length > 0) actions.updateNodes(patches);
  }, [editor, actions]);

  // Kept in a ref because `save` closes over the workspace's mutations, whose
  // identity changes on every render. Depending on it directly would tear the
  // subscription down mid-drag and take the pending save's timer with it.
  const saveRef = useRef(save);
  saveRef.current = save;

  // The listener only says "something moved". What actually changed is worked
  // out by diffing against the stored nodes, so a change this component made
  // itself settles to an empty patch list instead of echoing back to the API.
  useEffect(() => {
    if (!editor) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = editor.store.listen(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => saveRef.current(), SAVE_DEBOUNCE_MS);
      },
      { source: 'user', scope: 'document' },
    );

    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [editor]);

  // Seeded on open and whenever a node is added or removed. Layout flows the
  // other way after that: the canvas is what the person is looking at, so a
  // saved position is never pushed back onto the shape they are dragging.
  const boardShape = nodes
    .map((node) => `${node.id}:${node.groupId ?? ''}`)
    .sort()
    .join('|');
  useEffect(() => {
    if (editor) reconcile(editor, nodesRef.current);
  }, [editor, boardShape]);

  return (
    <div className="relative min-h-0 flex-1 bg-board">
      <MoodboardCanvasProvider value={context}>
        <Tldraw
          hideUi
          colorScheme="dark"
          shapeUtils={SHAPE_UTILS}
          components={COMPONENTS}
          onMount={(mounted) => {
            mounted.updateInstanceState({ isGridMode: true });
            reconcile(mounted, nodesRef.current);
            mounted.zoomToFit();
            setEditor(mounted);
          }}
        />
      </MoodboardCanvasProvider>
      {editor && (
        <MoodboardToolbar editor={editor} actions={actions} onSelectionChange={onSelectionChange} />
      )}
    </div>
  );
}

/**
 * Brings the canvas in line with the stored nodes.
 *
 * Only membership is reconciled — which shapes exist and which group they are
 * in. Positions are left alone so a reconcile triggered by a save cannot yank a
 * shape out from under the pointer.
 */
function reconcile(editor: Editor, nodes: readonly MoodboardNode[]): void {
  const wanted = new Map(nodes.map((node) => [node.id, node]));
  const drawn = new Set(
    editor
      .getCurrentPageShapes()
      .filter(isMoodboardShape)
      .map((shape) => nodeIdForShape(shape.id)),
  );

  const stale = [...drawn].filter((nodeId) => !wanted.has(nodeId));
  const missing = nodes.filter((node) => node.type !== 'group' && !drawn.has(node.id));

  editor.run(
    () => {
      if (stale.length > 0) editor.deleteShapes(stale.map(toShapeId));
      if (missing.length > 0) {
        // The projection deals in plain node ids; tldraw wants its branded one.
        editor.createShapes(missing.map((node) => ({ ...toShape(node), id: toShapeId(node.id) })));
      }
      reconcileGroups(editor, nodes);
    },
    { history: 'ignore' },
  );
}

/**
 * Rebuilds tldraw's own groups from the stored `groupId` of each node.
 *
 * A group needs two members to be worth having, so a group whose members have
 * been taken off the board simply is not drawn — the row is cleaned up when
 * someone ungroups or deletes it.
 */
function reconcileGroups(editor: Editor, nodes: readonly MoodboardNode[]): void {
  const groupNodeIds = new Set(nodes.filter((node) => node.type === 'group').map((n) => n.id));

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === 'group' && !groupNodeIds.has(nodeIdForShape(shape.id))) {
      editor.ungroupShapes([shape.id]);
    }
  }

  for (const groupNodeId of groupNodeIds) {
    const groupShapeId = createShapeId(groupNodeId);
    if (editor.getShape(groupShapeId)) continue;

    const members = nodes
      .filter((node) => node.groupId === groupNodeId)
      .map((node) => toShapeId(node.id))
      .filter((shapeId) => editor.getShape(shapeId));

    if (members.length >= 2) {
      editor.groupShapes(members, { groupId: groupShapeId, select: false });
    }
  }
}

/** Every node shape in back-to-front order, in page coordinates. */
function readSnapshots(editor: Editor): MoodboardShapeSnapshot[] {
  return editor
    .getCurrentPageShapesSorted()
    .filter(isMoodboardShape)
    .map((shape) => {
      // Page space, so a shape inside a group reports where it really is
      // rather than where it sits relative to its parent.
      const { x, y, rotation } = editor.getShapePageTransform(shape).decompose();
      return {
        id: shape.id,
        x,
        y,
        rotation,
        isLocked: shape.isLocked,
        parentId: shape.parentId,
        props: shape.props,
      };
    });
}

function isMoodboardShape(shape: TLShape): shape is MoodboardShape {
  return shape.type === MOODBOARD_SHAPE_TYPE;
}

function toShapeId(nodeId: string): TLShapeId {
  return shapeIdForNode(nodeId) as TLShapeId;
}

/** The board surface itself: a shade off the app canvas (spec §30). */
function MoodboardBackground() {
  return <div className="pointer-events-none absolute inset-0 bg-board" />;
}

/**
 * The board's grid: faint lines rather than the bright dots of a diagramming
 * tool (design system spec §30 — 3–6% opacity, no Figma-style dotted grid).
 */
function MoodboardGrid({ x, y, z, size }: TLGridProps) {
  const step = size * z;
  if (step < 8) return null;

  return (
    <svg className="tl-grid absolute inset-0 size-full text-white/[0.05]" aria-hidden>
      <defs>
        <pattern
          id="lz-moodboard-grid"
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
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
