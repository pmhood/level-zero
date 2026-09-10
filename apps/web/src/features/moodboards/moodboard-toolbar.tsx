'use client';

import type { MoodboardNodePatch, MoodboardNodeType } from '@level-zero/domain';
import { Button, PlusIcon } from '@level-zero/ui';

import { MOODBOARD_AUTHORED_NODE_TYPES, MOODBOARD_NODE_LABEL } from './moodboard';

/** Everything the canvas can ask the workspace to do to the stored board. */
export interface MoodboardCanvasActions {
  addNode: (type: MoodboardNodeType) => void;
  updateNodes: (patches: readonly MoodboardNodePatch[]) => void;
  removeNodes: (nodeIds: readonly string[]) => void;
  duplicateNodes: (nodeIds: readonly string[]) => void;
  /**
   * Adds a `group` node and puts the given nodes in it. The canvas draws the
   * new group as a frame around its members as soon as the board comes back.
   */
  createGroup: (memberNodeIds: readonly string[]) => void;
  removeGroup: (groupNodeId: string) => void;
  connect: (fromNodeId: string, toNodeId: string) => void;
}

export interface MoodboardToolbarProps {
  actions: MoodboardCanvasActions;
  /** The selected tiles. A selected group contributes its id below, not here. */
  selectedNodeIds: readonly string[];
  selectedGroupNodeIds: readonly string[];
  allLocked: boolean;
  onSetLocked: (locked: boolean) => void;
  onReorder: (end: 'front' | 'back') => void;
  onClearSelection: () => void;
}

/**
 * The board's compact floating toolbar (design system spec §30).
 *
 * There is no other chrome, so this is the whole surface: what can be added on
 * the left, and what can be done with the current selection along the bottom.
 * Ordering and locking are layout, so they go back through the same patch path
 * a drag does; adding, removing and grouping change what is *on* the board and
 * go through the workspace's mutations.
 */
export function MoodboardToolbar({
  actions,
  selectedNodeIds,
  selectedGroupNodeIds,
  allLocked,
  onSetLocked,
  onReorder,
  onClearSelection,
}: MoodboardToolbarProps) {
  const hasSelection = selectedNodeIds.length > 0 || selectedGroupNodeIds.length > 0;

  return (
    <>
      <div
        // The toolbar floats over the board but is chrome, not board: without
        // this a press on a button would also read as a press on the surface
        // behind it and clear the very selection the button acts on.
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-[var(--lz-shadow-floating)]"
      >
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
          onPointerDown={(event) => event.stopPropagation()}
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
          <Button variant="ghost" size="sm" onClick={() => onSetLocked(!allLocked)}>
            {allLocked ? 'Unlock' : 'Lock'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onReorder('front')}>
            Front
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onReorder('back')}>
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
              onClearSelection();
            }}
          >
            Remove from board
          </Button>
        </div>
      )}
    </>
  );
}
