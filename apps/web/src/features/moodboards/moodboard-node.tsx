'use client';

import { memo, type PointerEvent } from 'react';

import { useMoodboardCanvasContext } from './moodboard-canvas-context';
import type { Box } from './moodboard-geometry';
import type { MoodboardNodeContent } from './moodboard';

export interface MoodboardTileProps {
  nodeId: string;
  content: MoodboardNodeContent;
  /** Where the tile is right now, which mid-drag is not what is stored. */
  box: Box;
  zIndex: number;
  locked: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, nodeId: string) => void;
}

/**
 * One tile on the board.
 *
 * The tile is an absolutely positioned element carrying a CSS `rotate()`, so
 * the browser hit-tests it for free and the body inside is the same
 * Tailwind-styled React the rest of the app is made of. `transform-origin`
 * stays at its default centre, which is the rotation the stored `rotation`
 * field means.
 */
export const MoodboardTile = memo(function MoodboardTile({
  nodeId,
  content,
  box,
  zIndex,
  locked,
  onPointerDown,
}: MoodboardTileProps) {
  return (
    <div
      data-node-id={nodeId}
      aria-label={content.nodeType}
      className={locked ? 'absolute cursor-default' : 'absolute cursor-grab active:cursor-grabbing'}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: `rotate(${box.rotation}rad)`,
        zIndex,
      }}
      onPointerDown={(event) => onPointerDown(event, nodeId)}
    >
      <MoodboardNodeBody content={content} />
    </div>
  );
});

const SURFACE =
  'size-full overflow-hidden rounded-lg border border-border bg-surface text-foreground';

/**
 * What a tile shows.
 *
 * Every kind of node behaves identically on the board — a box that drags,
 * resizes, rotates, groups and locks — and differs only in what it draws, so
 * the difference is this one switch rather than seven components that each
 * re-implement the same geometry.
 */
export function MoodboardNodeBody({ content }: { content: MoodboardNodeContent }) {
  switch (content.nodeType) {
    case 'asset':
      return <AssetBody assetId={content.assetId} />;
    case 'entity':
      return <EntityBody entityId={content.entityId} />;
    case 'note':
      return (
        <div className="size-full overflow-hidden rounded-lg bg-[#e8b94c] p-3 text-[13px] leading-snug text-[#2a1f06]">
          {content.text || 'Sticky note'}
        </div>
      );
    case 'text':
      return (
        <div className="size-full overflow-hidden p-2 text-[15px] leading-snug text-foreground">
          {content.text || 'Text'}
        </div>
      );
    case 'palette':
      return <PaletteBody colors={content.colors} />;
    case 'link':
      return (
        <div className={`${SURFACE} flex flex-col justify-center gap-1 p-3`}>
          <p className="truncate text-[13px] font-semibold">{content.text || 'Reference link'}</p>
          <p className="truncate text-xs text-primary">{content.url}</p>
        </div>
      );
    case 'group':
      // A group has no tile of its own: it is drawn as a frame around wherever
      // its members currently are, which is the only bounds it really has.
      return null;
  }
}

function AssetBody({ assetId }: { assetId: string | null }) {
  const { projectId, assetSrc, assets } = useMoodboardCanvasContext();
  const asset = assetId ? assets.get(assetId) : undefined;

  if (!assetId) return <div className={SURFACE} />;

  return (
    <figure className={`${SURFACE} relative m-0`}>
      {/* A plain <img>: board images are project uploads streamed by the API,
          not statically-known routes Next's image optimiser can size. */}
      <img
        src={assetSrc(projectId, assetId)}
        alt={asset?.filename ?? 'Board image'}
        className="size-full object-cover"
        draggable={false}
      />
      {asset && (
        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-muted-foreground">
          {asset.filename}
        </figcaption>
      )}
    </figure>
  );
}

function EntityBody({ entityId }: { entityId: string | null }) {
  const { entities } = useMoodboardCanvasContext();
  const entity = entityId ? entities.get(entityId) : undefined;

  return (
    <div className={`${SURFACE} flex flex-col gap-1 p-3`}>
      <p className="text-[11px] uppercase tracking-wide text-faint-foreground">
        {entity?.type.replace(/_/g, ' ') ?? 'reference'}
      </p>
      <p className="truncate text-sm font-semibold">{entity?.name ?? 'Referenced entity'}</p>
      {entity?.description && (
        <p className="line-clamp-3 text-xs text-muted-foreground">{entity.description}</p>
      )}
    </div>
  );
}

function PaletteBody({ colors }: { colors: string[] }) {
  if (colors.length === 0) {
    return (
      <div className={`${SURFACE} flex items-center justify-center text-xs text-faint-foreground`}>
        Empty palette
      </div>
    );
  }

  return (
    <div className={`${SURFACE} flex`}>
      {colors.map((color, index) => (
        <div key={`${color}-${index}`} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}
