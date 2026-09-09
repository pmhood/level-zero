import type { MoodboardNode, MoodboardNodePatch, MoodboardNodeType } from '@level-zero/domain';

/**
 * Projection between the stored board model and the canvas that draws it.
 *
 * The board's own model is the one in Postgres: named x/y/width/height/
 * rotation/z-order/group/lock fields on `moodboard_nodes`. tldraw is the
 * interaction layer over it and persists nothing of its own — every shape on
 * the canvas is built from a node here, and every drag comes back through
 * `toNodePatch` as a change to those same named fields.
 *
 * Keeping the translation in one framework-free module is what makes it
 * testable: the canvas component is a thin shell around these functions.
 */
export const MOODBOARD_SHAPE_TYPE = 'lz-node';

const SHAPE_ID_PREFIX = 'shape:';

/** The node's content, flattened into the fields the shape actually draws. */
export interface MoodboardShapeProps {
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

/** What `editor.createShapes` needs to draw one node. */
export interface MoodboardShapeInput {
  id: string;
  type: typeof MOODBOARD_SHAPE_TYPE;
  x: number;
  y: number;
  rotation: number;
  isLocked: boolean;
  props: MoodboardShapeProps;
}

/** The subset of a tldraw shape this projection reads back. */
export interface MoodboardShapeSnapshot {
  id: string;
  x: number;
  y: number;
  rotation: number;
  isLocked: boolean;
  parentId: string;
  props: MoodboardShapeProps;
}

/** Shape ids mirror node ids, so no lookup table has to be kept in sync. */
export function shapeIdForNode(nodeId: string): string {
  return `${SHAPE_ID_PREFIX}${nodeId}`;
}

export function nodeIdForShape(shapeId: string): string {
  return shapeId.startsWith(SHAPE_ID_PREFIX) ? shapeId.slice(SHAPE_ID_PREFIX.length) : shapeId;
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

export function toShape(node: MoodboardNode): MoodboardShapeInput {
  return {
    id: shapeIdForNode(node.id),
    type: MOODBOARD_SHAPE_TYPE,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    isLocked: node.locked,
    props: {
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
 * Reads a shape back as a change to the node it was built from.
 *
 * `zOrder` comes from the shape's position in the canvas' own sorted order and
 * `groupId` from its parent, so tldraw's fractional indices and parent ids stay
 * inside tldraw: what is stored is a plain integer and a plain node id.
 */
export function toNodePatch(
  shape: MoodboardShapeSnapshot,
  zOrder: number,
  groupNodeIds: ReadonlySet<string>,
): MoodboardNodePatch {
  const parentNodeId = nodeIdForShape(shape.parentId);

  return {
    id: nodeIdForShape(shape.id),
    x: shape.x,
    y: shape.y,
    width: shape.props.w,
    height: shape.props.h,
    rotation: shape.rotation,
    zOrder,
    locked: shape.isLocked,
    groupId: groupNodeIds.has(parentNodeId) ? parentNodeId : null,
    data: contentData(shape.props),
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

/** Every change a canvas full of shapes implies, and nothing it does not. */
export function pendingNodePatches(
  nodes: readonly MoodboardNode[],
  sortedShapes: readonly MoodboardShapeSnapshot[],
): MoodboardNodePatch[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groupNodeIds = new Set(
    nodes.filter((node) => node.type === 'group').map((node) => node.id),
  );

  const patches: MoodboardNodePatch[] = [];
  sortedShapes.forEach((shape, zOrder) => {
    const patch = toNodePatch(shape, zOrder, groupNodeIds);
    const node = byId.get(patch.id);
    if (node && differsFromNode(node, patch)) patches.push(patch);
  });

  return patches;
}

/**
 * The `data` payload a node of this kind stores, built from what it draws.
 *
 * Empty fields are left out rather than stored as `""`, so a note nobody has
 * typed in reads back as the `{}` it was created with and does not look like a
 * change every time the board is opened.
 */
export function contentData(props: MoodboardShapeProps): Record<string, unknown> {
  switch (props.nodeType) {
    case 'text':
    case 'note':
      return withoutEmpty({ text: props.text });
    case 'link':
      return withoutEmpty({ url: props.url, text: props.text });
    case 'palette':
      return props.colors.length > 0 ? { colors: props.colors } : {};
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
