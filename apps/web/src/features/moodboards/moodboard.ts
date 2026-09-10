import type { MoodboardNode, MoodboardNodePatch, MoodboardNodeType } from '@level-zero/domain';

/**
 * Projection between the stored board model and the canvas that draws it.
 *
 * The board's own model is the one in Postgres: named x/y/width/height/
 * rotation/z-order/group/lock fields on `moodboard_nodes`. The canvas is the
 * interaction layer over it and persists nothing of its own — every tile on the
 * board is built from a node here, and every settled gesture comes back through
 * `toNodePatch` as a change to those same named fields.
 *
 * Keeping the translation in one framework-free module is what makes it
 * testable: the canvas component is a thin shell around these functions.
 */

/** The node's content, flattened into the fields a tile actually draws. */
export interface MoodboardNodeContent {
  nodeType: MoodboardNodeType;
  w: number;
  h: number;
  assetId: string | null;
  entityId: string | null;
  /** A text or sticky note's body, or a reference link's title. */
  text: string;
  /** A reference link's URL. */
  url: string;
  /** A colour palette's swatches. */
  colors: string[];
}

/** One tile as the canvas is drawing it, which is not always what is stored. */
export interface MoodboardNodeSnapshot {
  id: string;
  x: number;
  y: number;
  rotation: number;
  locked: boolean;
  /** The `group` node this tile is being dragged as part of, if any. */
  groupId: string | null;
  content: MoodboardNodeContent;
}

/** How big each kind of node starts, before anyone resizes it. */
export const MOODBOARD_NODE_DEFAULT_SIZE: Record<
  MoodboardNodeType,
  { width: number; height: number }
> = {
  asset: { width: 280, height: 280 },
  entity: { width: 240, height: 140 },
  text: { width: 280, height: 120 },
  note: { width: 200, height: 200 },
  palette: { width: 280, height: 96 },
  link: { width: 280, height: 96 },
  group: { width: 320, height: 320 },
};

export const MOODBOARD_NODE_LABEL: Record<MoodboardNodeType, string> = {
  asset: 'Image',
  entity: 'Reference',
  text: 'Text',
  note: 'Sticky note',
  palette: 'Palette',
  link: 'Link',
  group: 'Group',
};

/** The kinds a person adds from the toolbar; the rest come from the library. */
export const MOODBOARD_AUTHORED_NODE_TYPES = ['note', 'text', 'palette', 'link'] as const;

export function toSnapshot(node: MoodboardNode): MoodboardNodeSnapshot {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    locked: node.locked,
    groupId: node.groupId,
    content: {
      nodeType: node.type,
      w: node.width,
      h: node.height,
      assetId: node.assetId,
      entityId: node.entityId,
      text: readString(node.data, 'text'),
      url: readString(node.data, 'url'),
      colors: readStrings(node.data, 'colors'),
    },
  };
}

/**
 * Reads a tile back as a change to the node it was built from.
 *
 * `zOrder` comes from the tile's position in the canvas' own back-to-front
 * order, and a `groupId` naming a group that is no longer on the board reads
 * back as no group at all, so ungrouping settles itself on the next gesture.
 */
export function toNodePatch(
  snapshot: MoodboardNodeSnapshot,
  zOrder: number,
  groupNodeIds: ReadonlySet<string>,
): MoodboardNodePatch {
  return {
    id: snapshot.id,
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.content.w,
    height: snapshot.content.h,
    rotation: snapshot.rotation,
    zOrder,
    locked: snapshot.locked,
    groupId:
      snapshot.groupId !== null && groupNodeIds.has(snapshot.groupId) ? snapshot.groupId : null,
    data: contentData(snapshot.content),
  };
}

/** Whether a patch says anything the stored node does not already say. */
export function differsFromNode(node: MoodboardNode, patch: MoodboardNodePatch): boolean {
  return (
    node.x !== patch.x ||
    node.y !== patch.y ||
    node.width !== patch.width ||
    node.height !== patch.height ||
    node.rotation !== patch.rotation ||
    node.zOrder !== patch.zOrder ||
    node.locked !== patch.locked ||
    node.groupId !== (patch.groupId ?? null) ||
    !sameContent(node.data, patch.data ?? {})
  );
}

/**
 * Compares two `data` payloads without caring about key order.
 *
 * Postgres normalises `jsonb` key order on the way back out, so a plain
 * `JSON.stringify` comparison would report a difference on every read and the
 * canvas would save in a loop.
 */
function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

/** Every change a canvas full of tiles implies, and nothing it does not. */
export function pendingNodePatches(
  nodes: readonly MoodboardNode[],
  sortedSnapshots: readonly MoodboardNodeSnapshot[],
): MoodboardNodePatch[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groupNodeIds = new Set(
    nodes.filter((node) => node.type === 'group').map((node) => node.id),
  );

  const patches: MoodboardNodePatch[] = [];
  sortedSnapshots.forEach((snapshot, zOrder) => {
    const patch = toNodePatch(snapshot, zOrder, groupNodeIds);
    const node = byId.get(patch.id);
    if (node && differsFromNode(node, patch)) patches.push(patch);
  });

  return patches;
}

/** The board's tiles back to front. Group rows are not drawn, so are not here. */
export function drawnInZOrder(nodes: readonly MoodboardNode[]): MoodboardNode[] {
  return nodes.filter((node) => node.type !== 'group').sort((a, b) => a.zOrder - b.zOrder);
}

/**
 * The same order with some tiles moved to one end of it.
 *
 * Front and back are the only ordering the board offers, and `zOrder` is
 * renumbered from the resulting order by `pendingNodePatches`, so this never
 * has to invent an index between two others.
 */
export function movedToEnd(
  ordered: readonly MoodboardNode[],
  moving: ReadonlySet<string>,
  end: 'front' | 'back',
): MoodboardNode[] {
  const moved = ordered.filter((node) => moving.has(node.id));
  const rest = ordered.filter((node) => !moving.has(node.id));

  return end === 'front' ? [...rest, ...moved] : [...moved, ...rest];
}

/**
 * The `data` payload a node of this kind stores, built from what it draws.
 *
 * Empty fields are left out rather than stored as `""`, so a note nobody has
 * typed in reads back as the `{}` it was created with and does not look like a
 * change every time the board is opened.
 */
export function contentData(content: MoodboardNodeContent): Record<string, unknown> {
  switch (content.nodeType) {
    case 'text':
    case 'note':
      return withoutEmpty({ text: content.text });
    case 'link':
      return withoutEmpty({ url: content.url, text: content.text });
    case 'palette':
      return content.colors.length > 0 ? { colors: content.colors } : {};
    default:
      return {};
  }
}

function withoutEmpty(fields: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value.length > 0));
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

function readStrings(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
