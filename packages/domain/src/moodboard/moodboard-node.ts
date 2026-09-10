import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireJsonObject, requireOneOf, requireText } from '../shared/validation';

/**
 * What a node on a board shows.
 *
 * The design spec lists ten kinds of tile, but several are the same node with a
 * different referent: an uploaded image and a generated image are both an
 * `Asset`, and a character, a location and any other canonical object are all
 * an `Entity`. Collapsing those leaves the kinds that genuinely differ — what
 * the node points at, or what it holds itself.
 */
export const MOODBOARD_NODE_TYPES = [
  'asset',
  'entity',
  'text',
  'note',
  'palette',
  'link',
  'group',
] as const;
export type MoodboardNodeType = (typeof MOODBOARD_NODE_TYPES)[number];

export const DEFAULT_MOODBOARD_NODE_SIZE = 240;

/** Where a node sits on the board. Every field is per-board, never per-asset. */
export interface MoodboardNodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise, in radians. */
  rotation: number;
  /** Back-to-front order within the board. */
  zOrder: number;
}

/**
 * One tile on a moodboard.
 *
 * The board itself is an ordinary `Entity` of type `moodboard`. This row is the
 * part an entity cannot express: where something sits on *this* board. An
 * `asset` node carries an `assetId` and an `entity` node an `entityId`, so the
 * same asset can appear on two boards and in the asset library at once without
 * anything being copied — and deleting the node only deletes this placement.
 */
export interface MoodboardNode extends MoodboardNodeLayout {
  id: string;
  projectId: string;
  /** The `moodboard` entity this node is placed on. */
  boardId: string;
  type: MoodboardNodeType;
  /** The asset shown, for an `asset` node. Never a copy of it. */
  assetId: string | null;
  /** The canonical entity shown, for an `entity` node. */
  entityId: string | null;
  /** The `group` node this one belongs to, if any. */
  groupId: string | null;
  locked: boolean;
  /** Node-kind content: the text, the palette's colours, the link's URL. */
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMoodboardNodeInput extends Partial<MoodboardNodeLayout> {
  projectId: string;
  boardId: string;
  type: MoodboardNodeType;
  assetId?: string | null;
  entityId?: string | null;
  groupId?: string | null;
  locked?: boolean;
  data?: Record<string, unknown>;
}

export interface MoodboardNodeFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createMoodboardNode(
  input: CreateMoodboardNodeInput,
  deps: MoodboardNodeFactoryDeps,
): MoodboardNode {
  const now = deps.clock.now();
  const type = requireOneOf('type', input.type, MOODBOARD_NODE_TYPES);

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    boardId: requireText('boardId', input.boardId, 200),
    type,
    ...referencesFor(type, input),
    groupId: optionalText('groupId', input.groupId, 200),
    x: coordinate('x', input.x, 0),
    y: coordinate('y', input.y, 0),
    width: extent('width', input.width, DEFAULT_MOODBOARD_NODE_SIZE),
    height: extent('height', input.height, DEFAULT_MOODBOARD_NODE_SIZE),
    rotation: coordinate('rotation', input.rotation, 0),
    zOrder: order('zOrder', input.zOrder, 0),
    locked: input.locked ?? false,
    data: requireJsonObject('data', input.data),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * What a placement can be changed to.
 *
 * `type`, `assetId` and `entityId` are deliberately absent: a node showing a
 * different asset is a different node, and letting a drag re-point a reference
 * is exactly the accident the board model exists to prevent.
 */
export interface UpdateMoodboardNodeInput extends Partial<MoodboardNodeLayout> {
  groupId?: string | null;
  locked?: boolean;
  data?: Record<string, unknown>;
}

/** Returns a node with the given fields changed; the input is never mutated. */
export function updateMoodboardNode(
  node: MoodboardNode,
  patch: UpdateMoodboardNodeInput,
  deps: { clock: Clock },
): MoodboardNode {
  const next: MoodboardNode = { ...node, data: { ...node.data } };

  if (patch.x !== undefined) next.x = coordinate('x', patch.x, node.x);
  if (patch.y !== undefined) next.y = coordinate('y', patch.y, node.y);
  if (patch.width !== undefined) next.width = extent('width', patch.width, node.width);
  if (patch.height !== undefined) next.height = extent('height', patch.height, node.height);
  if (patch.rotation !== undefined) {
    next.rotation = coordinate('rotation', patch.rotation, node.rotation);
  }
  if (patch.zOrder !== undefined) next.zOrder = order('zOrder', patch.zOrder, node.zOrder);
  if (patch.groupId !== undefined) next.groupId = optionalText('groupId', patch.groupId, 200);
  if (patch.locked !== undefined) next.locked = patch.locked;
  if (patch.data !== undefined) next.data = requireJsonObject('data', patch.data);

  next.updatedAt = deps.clock.now();
  return next;
}

/** The canonical row each node type points at, and the ones that point at nothing. */
const REFERENCED_BY: Record<MoodboardNodeType, 'assetId' | 'entityId' | null> = {
  asset: 'assetId',
  entity: 'entityId',
  text: null,
  note: null,
  palette: null,
  link: null,
  group: null,
};

/**
 * Checks a node points at exactly the canonical row its type implies.
 *
 * A `text` node carrying an `assetId` would be a second, invisible way for a
 * board to claim an asset, so it is rejected rather than ignored.
 */
function referencesFor(
  type: MoodboardNodeType,
  input: Pick<CreateMoodboardNodeInput, 'assetId' | 'entityId'>,
): Pick<MoodboardNode, 'assetId' | 'entityId'> {
  const references = {
    assetId: optionalText('assetId', input.assetId, 200),
    entityId: optionalText('entityId', input.entityId, 200),
  };
  const expected = REFERENCED_BY[type];

  for (const field of ['assetId', 'entityId'] as const) {
    if (expected === field && references[field] === null) {
      throw new ValidationError(
        `A ${type} node must reference ${field === 'assetId' ? 'an asset' : 'an entity'}`,
        {
          field,
          type,
        },
      );
    }
    if (expected !== field && references[field] !== null) {
      throw new ValidationError(
        `A ${type} node cannot reference ${field === 'assetId' ? 'an asset' : 'an entity'}`,
        {
          field,
          type,
        },
      );
    }
  }

  return references;
}

/** A position on the board: any finite number, including negative ones. */
function coordinate(field: string, value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`, { field, received: value });
  }
  return value;
}

/** A width or height: finite and greater than zero, so a node is always visible. */
function extent(field: string, value: unknown, fallback: number): number {
  const size = coordinate(field, value, fallback);
  if (size <= 0) {
    throw new ValidationError(`${field} must be greater than zero`, { field, received: value });
  }
  return size;
}

function order(field: string, value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`, { field, received: value });
  }
  return value;
}
