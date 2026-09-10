'use client';

import type { Asset, Entity } from '@level-zero/domain';
import { Button, EmptyState, Input, SearchField } from '@level-zero/ui';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

/**
 * The rail beside the canvas: which board is open, and what can go on it.
 *
 * The library half lists the project's own assets and entities. Clicking one
 * places a node that *points* at it — the same image can be on this board, the
 * next board and in the asset library at once, because nothing here copies
 * anything.
 */
export interface MoodboardRailProps {
  boards: readonly Entity[];
  boardsPending: boolean;
  boardsError: unknown;
  openBoardId: string | null;
  onOpenBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
  creating: boolean;
  assets: readonly Asset[];
  entities: readonly Entity[];
  onPlaceAsset: (assetId: string) => void;
  onPlaceEntity: (entityId: string) => void;
}

export function MoodboardRail({
  boards,
  boardsPending,
  boardsError,
  openBoardId,
  onOpenBoard,
  onCreateBoard,
  creating,
  assets,
  entities,
  onPlaceAsset,
  onPlaceEntity,
}: MoodboardRailProps) {
  return (
    <aside
      aria-label="Boards and library"
      className="flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4"
    >
      <BoardPicker
        boards={boards}
        isPending={boardsPending}
        error={boardsError}
        openBoardId={openBoardId}
        onOpen={onOpenBoard}
        onCreate={onCreateBoard}
        creating={creating}
      />
      {openBoardId && (
        <Library
          assets={assets}
          entities={entities}
          onPlaceAsset={onPlaceAsset}
          onPlaceEntity={onPlaceEntity}
        />
      )}
    </aside>
  );
}

function BoardPicker({
  boards,
  isPending,
  error,
  openBoardId,
  onOpen,
  onCreate,
  creating,
}: {
  boards: readonly Entity[];
  isPending: boolean;
  error: unknown;
  openBoardId: string | null;
  onOpen: (boardId: string) => void;
  onCreate: (name: string) => void;
  creating: boolean;
}) {
  const [name, setName] = useState('');

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
  }

  return (
    <section aria-label="Boards" className="flex flex-col gap-2">
      <h2 className="text-xs font-medium text-muted-foreground">Boards</h2>

      {isPending && <p className="text-xs text-faint-foreground">Loading boards…</p>}

      {!isPending && error != null && (
        <EmptyState title="Couldn't load boards" description={apiErrorMessage(error)} />
      )}

      {!isPending && error == null && boards.length === 0 && (
        <p className="text-xs text-faint-foreground">
          No boards yet. Name one below and start gathering references.
        </p>
      )}

      {boards.map((board) => (
        <button
          key={board.id}
          type="button"
          onClick={() => onOpen(board.id)}
          aria-current={board.id === openBoardId}
          className={`truncate rounded-md px-2.5 py-2 text-left text-sm ${
            board.id === openBoardId
              ? 'bg-active text-foreground'
              : 'text-muted-foreground hover:bg-hover hover:text-foreground'
          }`}
        >
          {board.name}
        </button>
      ))}

      <div className="mt-1 flex gap-2">
        <Input
          aria-label="New board name"
          placeholder="New board"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && create()}
        />
        <Button size="sm" onClick={create} disabled={creating || name.trim().length === 0}>
          Add
        </Button>
      </div>
    </section>
  );
}

function Library({
  assets,
  entities,
  onPlaceAsset,
  onPlaceEntity,
}: {
  assets: readonly Asset[];
  entities: readonly Entity[];
  onPlaceAsset: (assetId: string) => void;
  onPlaceEntity: (entityId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const matchingAssets = assets.filter((asset) => asset.filename.toLowerCase().includes(needle));
  const matchingEntities = entities.filter((entity) => entity.name.toLowerCase().includes(needle));

  return (
    <section aria-label="Add to board" className="flex min-h-0 flex-col gap-2">
      <h2 className="text-xs font-medium text-muted-foreground">Add to board</h2>
      <SearchField
        label="Search images and entities"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search images and entities"
      />

      {matchingAssets.length === 0 && matchingEntities.length === 0 && (
        <p className="text-xs text-faint-foreground">
          Nothing matches. Upload images in Assets, or create entities in World and Characters.
        </p>
      )}

      {matchingAssets.map((asset) => (
        <LibraryRow
          key={asset.id}
          label={asset.filename}
          detail="image"
          onClick={() => onPlaceAsset(asset.id)}
        />
      ))}
      {matchingEntities.map((entity) => (
        <LibraryRow
          key={entity.id}
          label={entity.name}
          detail={entity.type.replace(/_/g, ' ')}
          onClick={() => onPlaceEntity(entity.id)}
        />
      ))}
    </section>
  );
}

function LibraryRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-md px-2.5 py-1.5 text-left hover:bg-hover"
    >
      <span className="truncate text-sm text-foreground">{label}</span>
      <span className="text-[11px] uppercase tracking-wide text-faint-foreground">{detail}</span>
    </button>
  );
}
