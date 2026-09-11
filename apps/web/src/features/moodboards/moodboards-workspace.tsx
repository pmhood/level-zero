'use client';

import type { Entity, MoodboardNodeType, RelationType } from '@level-zero/domain';
import { EmptyState, WorkspacePage } from '@level-zero/ui';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { GenerationPanel } from '@/features/generation/generation-panel';
import { apiErrorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { MoodboardCanvas } from './moodboard-canvas';
import { MoodboardInspector } from './moodboard-inspector';
import { MoodboardRail } from './moodboard-rail';
import { MOODBOARD_NODE_DEFAULT_SIZE, drawnInZOrder } from './moodboard';
import {
  useAddMoodboardNode,
  useConnectMoodboardNodes,
  useCreateMoodboard,
  useDisconnectMoodboardNodes,
  useDuplicateMoodboardNodes,
  useGroupMoodboardNodes,
  useMoodboard,
  useMoodboardLibrary,
  useMoodboardLibrarySearch,
  useMoodboards,
  usePromoteMoodboardConnector,
  usePromoteToVisualDirection,
  useRemoveMoodboardNodes,
  useUpdateMoodboardNodes,
} from './use-moodboards';
import type { MoodboardCanvasActions } from './moodboard-toolbar';

/** New nodes cascade from here so two additions never land on top of each other. */
const PLACEMENT_ORIGIN = 120;
const PLACEMENT_STEP = 32;

/**
 * The Moodboards workspace: a freeform canvas for visual research (UX spec,
 * "Moodboards").
 *
 * Boards are `moodboard` entities and everything on one is a placement that
 * points at a canonical asset or entity, so gathering references here never
 * forks the project's content — and taking something off a board never takes it
 * out of the project.
 */
export function MoodboardsWorkspace({ projectId }: { projectId: string }) {
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');

  const boardsQuery = useMoodboards(projectId);
  const boardQuery = useMoodboard(projectId, openBoardId);
  const library = useMoodboardLibrary(projectId);
  const debouncedLibrarySearch = useDebouncedValue(librarySearch, 250);
  const librarySearchResults = useMoodboardLibrarySearch(projectId, debouncedLibrarySearch);

  const boardId = openBoardId ?? '';
  const createBoard = useCreateMoodboard(projectId);
  const addNode = useAddMoodboardNode(projectId, boardId);
  const updateNodes = useUpdateMoodboardNodes(projectId, boardId);
  const removeNodes = useRemoveMoodboardNodes(projectId, boardId);
  const duplicateNodes = useDuplicateMoodboardNodes(projectId, boardId);
  const groupNodes = useGroupMoodboardNodes(projectId, boardId);
  const connectNodes = useConnectMoodboardNodes(projectId, boardId);
  const disconnect = useDisconnectMoodboardNodes(projectId, boardId);
  const promote = usePromoteMoodboardConnector(projectId, boardId);
  const promoteToVisualDirection = usePromoteToVisualDirection(projectId);

  const boards = boardsQuery.data?.items ?? [];
  const nodes = useMemo(() => boardQuery.data?.nodes ?? [], [boardQuery.data]);
  const connectors = useMemo(() => boardQuery.data?.connectors ?? [], [boardQuery.data]);

  const entities = useMemo(
    () => new Map((library.entities.data?.items ?? []).map((entity) => [entity.id, entity])),
    [library.entities.data],
  );
  const assets = useMemo(
    () => new Map((library.assets.data?.items ?? []).map((asset) => [asset.id, asset])),
    [library.assets.data],
  );

  const place = useCallback(
    (type: MoodboardNodeType, reference: { assetId?: string; entityId?: string } = {}) => {
      const drawn = drawnInZOrder(nodes);
      const lastNode = drawn.at(-1);
      const maxZOrder = lastNode?.zOrder ?? -1;
      const offset = PLACEMENT_ORIGIN + nodes.length * PLACEMENT_STEP;
      addNode.mutate({
        type,
        ...reference,
        x: offset,
        y: offset,
        ...MOODBOARD_NODE_DEFAULT_SIZE[type],
        zOrder: maxZOrder + 1,
      });
    },
    [addNode, nodes],
  );

  const actions = useMemo<MoodboardCanvasActions>(
    () => ({
      addNode: (type) => place(type),
      updateNodes: (patches) => updateNodes.mutateAsync(patches),
      removeNodes: (nodeIds) => removeNodes.mutate(nodeIds),
      duplicateNodes: (nodeIds) => duplicateNodes.mutate(nodeIds),
      createGroup: (memberNodeIds) => groupNodes.mutate(memberNodeIds),
      removeGroup: (groupNodeId) => removeNodes.mutate([groupNodeId]),
      connect: (fromNodeId, toNodeId) => connectNodes.mutate({ fromNodeId, toNodeId }),
    }),
    [place, updateNodes, removeNodes, duplicateNodes, groupNodes, connectNodes],
  );

  const selectedNode =
    selectedNodeIds.length === 1
      ? (nodes.find((node) => node.id === selectedNodeIds[0]) ?? null)
      : null;

  // The entities on the selected nodes become the generator's context, so
  // asking for "more like this" carries what the board is actually about.
  const selectedEntities = useMemo(
    () =>
      nodes
        .filter((node) => selectedNodeIds.includes(node.id) && node.entityId)
        .map((node) => entities.get(node.entityId as string))
        .filter((entity): entity is Entity => entity !== undefined),
    [nodes, selectedNodeIds, entities],
  );

  function openBoard(nextBoardId: string) {
    setOpenBoardId(nextBoardId);
    setSelectedNodeIds([]);
  }

  return (
    <WorkspacePage
      title="Moodboards"
      description="Visual research: gather references, arrange a direction, and connect what it is for."
      inspector={
        <MoodboardInspector
          board={boardQuery.data?.board ?? null}
          node={selectedNode}
          entities={entities}
          assets={assets}
          connectors={connectors}
          nodes={nodes}
          onEditContent={(nodeId, data) => updateNodes.mutate([{ id: nodeId, data }])}
          onPromoteConnector={(connectorId, relation: RelationType) =>
            promote.mutate({ connectorId, relation })
          }
          onDisconnect={(connectorId) => disconnect.mutate(connectorId)}
          onPromoteToVisualDirection={(source) => promoteToVisualDirection.mutateAsync(source)}
          generator={
            openBoardId && (
              <GenerationPanel
                projectId={projectId}
                contextEntities={selectedEntities}
                referenceAssets={library.assets.data?.items ?? []}
                onUseResult={(asset) => place('asset', { assetId: asset.id })}
                useResultLabel="Add to board"
              />
            )
          }
        />
      }
    >
      <MoodboardRail
        boards={boards}
        boardsPending={boardsQuery.isPending}
        boardsError={boardsQuery.error}
        openBoardId={openBoardId}
        onOpenBoard={openBoard}
        onCreateBoard={(name) =>
          createBoard.mutate(name, { onSuccess: (board) => openBoard(board.id) })
        }
        creating={createBoard.isPending}
        assets={librarySearchResults.assets.data?.items ?? []}
        entities={librarySearchResults.entities.data?.items ?? []}
        librarySearch={librarySearch}
        onLibrarySearchChange={setLibrarySearch}
        onPlaceAsset={(assetId) => place('asset', { assetId })}
        onPlaceEntity={(entityId) => place('entity', { entityId })}
      />

      <BoardSurface
        hasBoard={Boolean(openBoardId)}
        isPending={Boolean(openBoardId) && boardQuery.isPending}
        error={boardQuery.error}
        onRetry={() => void boardQuery.refetch()}
      >
        {boardQuery.data && (
          <MoodboardCanvas
            key={boardQuery.data.board.id}
            projectId={projectId}
            nodes={nodes}
            connectors={connectors}
            entities={entities}
            assets={assets}
            actions={actions}
            onSelectionChange={setSelectedNodeIds}
          />
        )}
      </BoardSurface>
    </WorkspacePage>
  );
}

/** Everything the canvas can be instead of a canvas. */
function BoardSurface({
  hasBoard,
  isPending,
  error,
  onRetry,
  children,
}: {
  hasBoard: boolean;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (!hasBoard) {
    return (
      <Centered>
        <EmptyState
          title="No board open"
          description="Pick a board from the list, or start a new one. A moodboard is where a look gets found before anything is decided."
        />
      </Centered>
    );
  }

  if (isPending) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">Loading board…</p>
      </Centered>
    );
  }

  if (error != null) {
    return (
      <Centered>
        <EmptyState
          title="Couldn't open this board"
          description={apiErrorMessage(error)}
          actions={
            <button
              type="button"
              onClick={onRetry}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          }
        />
      </Centered>
    );
  }

  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 items-center justify-center p-5">{children}</div>;
}
