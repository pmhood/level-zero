'use client';

import { MOODBOARD_NODE_TYPES } from '@level-zero/domain';
import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLBaseShape } from 'tldraw';

import { useMoodboardCanvasContext } from './moodboard-canvas-context';
import {
  MOODBOARD_NODE_DEFAULT_SIZE,
  MOODBOARD_SHAPE_TYPE,
  type MoodboardShapeProps,
} from './moodboard';

export type MoodboardShape = TLBaseShape<typeof MOODBOARD_SHAPE_TYPE, MoodboardShapeProps>;

/**
 * Registers the board's shape with tldraw's own `TLShape` union.
 *
 * This is tldraw's documented extension point for a custom shape; without it
 * every editor call would need a cast, which is the sort of thing that hides a
 * real mistake behind a plausible one.
 */
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'lz-node': MoodboardShapeProps;
  }
}

/**
 * The one shape the moodboard canvas draws.
 *
 * Every kind of board node is this shape with a different `nodeType`, because
 * they behave identically — a box that drags, resizes, rotates, groups and
 * locks — and differ only in what they show. Seven shape classes would be seven
 * copies of the same geometry.
 *
 * Nothing here is a store: `props` are projected from the `moodboard_nodes` row
 * on load and read back out on change (see `moodboard.ts`).
 */
export class MoodboardShapeUtil extends BaseBoxShapeUtil<MoodboardShape> {
  static override type = MOODBOARD_SHAPE_TYPE;

  static override props: RecordProps<MoodboardShape> = {
    nodeType: T.literalEnum(...MOODBOARD_NODE_TYPES),
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    assetId: T.string.nullable(),
    entityId: T.string.nullable(),
    text: T.string,
    url: T.string,
    colors: T.arrayOf(T.string),
  };

  override getDefaultProps(): MoodboardShapeProps {
    return {
      nodeType: 'note',
      ...sizeProps('note'),
      assetId: null,
      entityId: null,
      text: '',
      url: '',
      colors: [],
    };
  }

  /** Content is edited in the inspector, so the canvas stays about arranging. */
  override canEdit(): boolean {
    return false;
  }

  override getIndicatorPath(shape: MoodboardShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override component(shape: MoodboardShape) {
    return (
      <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
        <MoodboardShapeBody shape={shape} />
      </HTMLContainer>
    );
  }
}

function sizeProps(nodeType: MoodboardShapeProps['nodeType']): { w: number; h: number } {
  const { width, height } = MOODBOARD_NODE_DEFAULT_SIZE[nodeType];
  return { w: width, h: height };
}

const SURFACE =
  'size-full overflow-hidden rounded-lg border border-border bg-surface text-foreground';

function MoodboardShapeBody({ shape }: { shape: MoodboardShape }) {
  const { props } = shape;

  switch (props.nodeType) {
    case 'asset':
      return <AssetBody assetId={props.assetId} />;
    case 'entity':
      return <EntityBody entityId={props.entityId} />;
    case 'note':
      return (
        <div className="size-full overflow-hidden rounded-lg bg-[#e8b94c] p-3 text-[13px] leading-snug text-[#2a1f06]">
          {props.text || 'Sticky note'}
        </div>
      );
    case 'text':
      return (
        <div className="size-full overflow-hidden p-2 text-[15px] leading-snug text-foreground">
          {props.text || 'Text'}
        </div>
      );
    case 'palette':
      return <PaletteBody colors={props.colors} />;
    case 'link':
      return (
        <div className={`${SURFACE} flex flex-col justify-center gap-1 p-3`}>
          <p className="truncate text-[13px] font-semibold">{props.text || 'Reference link'}</p>
          <p className="truncate text-xs text-primary">{props.url}</p>
        </div>
      );
    case 'group':
      return <div className="size-full rounded-lg border border-dashed border-border-strong" />;
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
