'use client';

import type { MoodboardNodePatch, MoodboardNodeType } from '@level-zero/domain';
import { Button, PlusIcon } from '@level-zero/ui';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';

import {
  MOODBOARD_AUTHORED_NODE_TYPES,
  MOODBOARD_NODE_LABEL,
  MOODBOARD_SHAPE_TYPE,
  nodeIdForShape,
} from './moodboard';

/** Everything the canvas can ask the workspace to do to the stored board. */
export interface MoodboardCanvasActions {
  addNode: (type: MoodboardNodeType) => void;
  updateNodes: (patches: readonly MoodboardNodePatch[]) => void;
  removeNodes: (nodeIds: readonly string[]) => void;
  duplicateNodes: (nodeIds: readonly string[]) => void;
  /**
   * Adds a `group` node and puts the given nodes in it. The canvas picks the
   * new membership up on its next reconcile and groups the shapes to match.
   */
  createGroup: (memberNodeIds: readonly string[]) => void;
  removeGroup: (groupNodeId: string) => void;
  connect: (fromNodeId: string, toNodeId: string) => void;
}

export interface MoodboardToolbarProps {
  editor: Editor;
  actions: MoodboardCanvasActions;
  onSelectionChange: (nodeIds: readonly string[]) => void;
}

/**
 * The board's compact floating toolbar (design system spec §30).
 *
 * tldraw's own chrome is hidden, so this is the whole surface: what can be
 * added on the left, and what can be done with the current selection along the
 * bottom. Actions that only move pixels are applied to the canvas and picked up
 * by its save loop; actions that change what is *on* the board go through the
 * workspace's mutations.
 */
export function MoodboardToolbar({ editor, actions, onSelectionChange }: MoodboardToolbarProps) {
  const selectedNodeIds = useValue(
    'moodboard selection',
    () =>
      editor
        .getSelectedShapes()
        .filter((shape) => shape.type === MOODBOARD_SHAPE_TYPE)
        .map((shape) => nodeIdForShape(shape.id)),
    [editor],
  );
  const selectedGroupNodeIds = useValue(
    'moodboard selected groups',
    () =>
      editor
        .getSelectedShapes()
        .filter((shape) => shape.type === 'group')
        .map((shape) => nodeIdForShape(shape.id)),
    [editor],
  );
  const allLocked = useValue(
    'moodboard selection locked',
    () => editor.getSelectedShapes().every((shape) => shape.isLocked),
    [editor],
  );

  useEffect(() => {
    onSelectionChange(selectedNodeIds);
  }, [selectedNodeIds, onSelectionChange]);

  const selectedShapeIds = editor.getSelectedShapeIds();
  const hasSelection = selectedNodeIds.length > 0 || selectedGroupNodeIds.length > 0;

  function apply(change: () => void) {
    editor.run(change, { ignoreShapeLock: true });
  }

  return (
    <>
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-[var(--lz-shadow-floating)]">
        {MOODBOARD_AUTHORED_NODE_TYPES.map((type) => (
          <Button key={type} variant="ghost" size="sm" onClick={() => actions.addNode(type)}>
            <PlusIcon className="size-3.5" />
            {MOODBOARD_NODE_LABEL[type]}
          </Button>
        ))}
      </div>

      {hasSelection && (
        <div
          role="toolbar"
          aria-label="Board selection"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-surface/95 p-1 shadow-[var(--lz-shadow-floating)]"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.duplicateNodes(selectedNodeIds)}
            disabled={selectedNodeIds.length === 0}
          >
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.createGroup(selectedNodeIds)}
            disabled={selectedNodeIds.length < 2}
          >
            Group
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedGroupNodeIds.forEach(actions.removeGroup)}
            disabled={selectedGroupNodeIds.length === 0}
          >
            Ungroup
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply(() => editor.toggleLock(selectedShapeIds))}
          >
            {allLocked ? 'Unlock' : 'Lock'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply(() => editor.bringToFront(selectedShapeIds))}
          >
            Front
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply(() => editor.sendToBack(selectedShapeIds))}
          >
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.connect(selectedNodeIds[0]!, selectedNodeIds[1]!)}
            disabled={selectedNodeIds.length !== 2}
          >
            Connect
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedNodeIds.length === 0}
            onClick={() => {
              actions.removeNodes(selectedNodeIds);
              editor.selectNone();
            }}
          >
            Remove from board
          </Button>
        </div>
      )}
    </>
  );
}
