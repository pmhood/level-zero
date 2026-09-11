'use client';

import type { MoodboardNode, MoodboardNodePatch, MoodboardNodeType } from '@level-zero/domain';
import { Button, PlusIcon } from '@level-zero/ui';

import { MOODBOARD_AUTHORED_NODE_TYPES, MOODBOARD_NODE_LABEL } from './moodboard';

/** Everything the canvas can ask the workspace to do to the stored board. */
export interface MoodboardCanvasActions {
  /**
   * Places a new node and hands back what the database actually stored —
   * the canvas needs the assigned id before it can record a create as a step
   * of history, so this is called through `commitCreate`, not straight from
   * the toolbar; see `moodboard-canvas.tsx`.
   */
  addNode: (type: MoodboardNodeType) => Promise<MoodboardNode>;
  /**
   * Settles a layout change. Returns the save so the canvas can revert a
   * gesture's draft and drop its history entry when the write is rejected —
   * see the failure handling in `moodboard-canvas.tsx`.
   */
  updateNodes: (patches: readonly MoodboardNodePatch[]) => Promise<unknown>;
  /**
   * Removes placements. Resolves once the removal is confirmed, so a delete
   * recorded ahead of the save (`commitDelete`) can be popped back off the
   * undo stack if the save is rejected — the same guard `commitPatches` uses.
   */
  removeNodes: (nodeIds: readonly string[]) => Promise<void>;
  /**
   * Re-creates nodes that were previously removed — undo's inverse of a
   * settled delete, and redo's replay of a settled create. Preserves layout,
   * group membership, lock state and content, and re-points at the same
   * `assetId`/`entityId` rather than creating a new Asset or Entity, but
   * always under a fresh id: there is no way to ask the database for the old
   * one back once the row is gone.
   */
  restoreNodes: (nodes: readonly MoodboardNode[]) => Promise<MoodboardNode[]>;
  duplicateNodes: (nodeIds: readonly string[]) => void;
  /**
   * Adds a `group` node and puts the given nodes in it. The canvas draws the
   * new group as a frame around its members as soon as the board comes back.
   * Returns the created row, the same way `addNode` does, so a group and its
   * ungroup are each one step of history (issue #126) rather than untracked.
   */
  createGroup: (memberNodeIds: readonly string[]) => Promise<MoodboardNode>;
  /**
   * Removes a group row. The database detaches its members itself (the
   * `group_id` foreign key is `ON DELETE SET NULL`), so this never needs to
   * patch them. Resolves once the removal is confirmed, the same reason
   * `removeNodes` does, so an ungroup recorded ahead of the save can be
   * popped back off if it is rejected.
   */
  removeGroup: (groupNodeId: string) => Promise<void>;
  connect: (fromNodeId: string, toNodeId: string) => void;
}

export interface MoodboardToolbarProps {
  actions: MoodboardCanvasActions;
  /**
   * Adds a node as one step of history. A plain callback rather than
   * `actions.addNode` directly, the same way locking and reordering already
   * go through `onSetLocked`/`onReorder` instead of `actions.updateNodes`.
   */
  onAddNode: (type: MoodboardNodeType) => void;
  /** Removes the given placements as one step of history. */
  onRemoveNodes: (nodeIds: readonly string[]) => void;
  /** Groups the selection as one step of history, in place of `actions.createGroup`. */
  onCreateGroup: (memberNodeIds: readonly string[]) => void;
  /** Removes a group as one step of history, in place of `actions.removeGroup`. */
  onRemoveGroup: (groupNodeId: string) => void;
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
  onAddNode,
  onRemoveNodes,
  onCreateGroup,
  onRemoveGroup,
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
          <Button key={type} variant="ghost" size="sm" onClick={() => onAddNode(type)}>
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
            onClick={() => onCreateGroup(selectedNodeIds)}
            disabled={selectedNodeIds.length < 2}
          >
            Group
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedGroupNodeIds.forEach(onRemoveGroup)}
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
              onRemoveNodes(selectedNodeIds);
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
