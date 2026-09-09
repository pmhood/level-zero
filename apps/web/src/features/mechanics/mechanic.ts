import { readParameters, type Entity, type EntityType, type Parameter } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * Mechanics are ordinary canonical entities. `mechanic` is one rule or system
 * a player meets; `system` is the container that groups them — a core loop, an
 * economy — and the Mechanics workspace lists both.
 */
export const MECHANIC_ENTITY_TYPES = [
  'mechanic',
  'system',
] as const satisfies readonly EntityType[];

export type MechanicEntityType = (typeof MECHANIC_ENTITY_TYPES)[number];

/** The modules the Mechanics workspace is organised around (UX spec, "Mechanics"). */
export const MECHANIC_AREAS = [
  'core_loop',
  'progression',
  'resources',
  'economy',
  'crafting',
  'combat',
  'ai',
  'risk_reward',
  'difficulty',
  'rewards',
  'exploration',
] as const;

export type MechanicArea = (typeof MECHANIC_AREAS)[number];

const MECHANIC_AREA_LABELS: Record<MechanicArea, string> = {
  core_loop: 'Core Loop',
  progression: 'Progression',
  resources: 'Resources',
  economy: 'Economy',
  crafting: 'Crafting',
  combat: 'Combat',
  ai: 'AI',
  risk_reward: 'Risk / Reward',
  difficulty: 'Difficulty',
  rewards: 'Rewards',
  exploration: 'Exploration',
};

export function mechanicAreaLabel(area: MechanicArea): string {
  return MECHANIC_AREA_LABELS[area];
}

/**
 * How far a mechanic has got from idea to running code.
 *
 * Separate from `Entity.status`, which is the entity's lifecycle (draft,
 * active, archived): a mechanic can be an active part of the design and still
 * be nothing but a concept.
 */
export const IMPLEMENTATION_STATUSES = [
  'concept',
  'designed',
  'prototyped',
  'implemented',
  'cut',
] as const;

export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

const IMPLEMENTATION_STATUS_BADGES: Record<
  ImplementationStatus,
  { label: string; tone: StatusTone }
> = {
  concept: { label: 'Concept', tone: 'neutral' },
  designed: { label: 'Designed', tone: 'neutral' },
  prototyped: { label: 'Prototyped', tone: 'warning' },
  implemented: { label: 'Implemented', tone: 'success' },
  cut: { label: 'Cut', tone: 'error' },
};

export function implementationStatusBadge(status: ImplementationStatus): {
  label: string;
  tone: StatusTone;
} {
  return IMPLEMENTATION_STATUS_BADGES[status];
}

/** The field of a mechanic's `data` its rich-text rationale is stored in. */
export const MECHANIC_RATIONALE_FIELD = 'rationale';

/**
 * The structured part of a mechanic, as stored in the entity's `data` JSONB.
 *
 * Deliberately not here: `linkedMechanics`, which is the relationship graph
 * rather than a field, and `rationale`, which is TipTap JSON read through
 * `entityDocument`. Anything else a later issue adds to `data` is carried
 * through untouched by `writeMechanic`.
 */
export interface MechanicData {
  area: MechanicArea;
  /** The player-facing intent — what this is supposed to feel like. */
  fantasy: string;
  rules: string[];
  inputs: string[];
  outputs: string[];
  implementationStatus: ImplementationStatus;
  /**
   * The numbers, switches and choices this mechanic is tuned by. The shape is
   * the domain's, because prototypes and playtests refer to the same
   * parameters by the same ids; the workspace only edits them.
   */
  tuningParameters: Parameter[];
}

const EMPTY_MECHANIC: MechanicData = {
  area: 'core_loop',
  fantasy: '',
  rules: [],
  inputs: [],
  outputs: [],
  implementationStatus: 'concept',
  tuningParameters: [],
};

/**
 * Reads a mechanic's structured fields out of `data`.
 *
 * Anything missing or of the wrong shape reads as its empty value: `data` is
 * schemaless by design, so an entity promoted from an idea — which has none of
 * these fields — has to open in the editor rather than fail in it.
 */
export function readMechanic(entity: Entity): MechanicData {
  const data = entity.data;

  return {
    area: oneOf(data.area, MECHANIC_AREAS, EMPTY_MECHANIC.area),
    fantasy: typeof data.fantasy === 'string' ? data.fantasy : '',
    rules: stringList(data.rules),
    inputs: stringList(data.inputs),
    outputs: stringList(data.outputs),
    implementationStatus: oneOf(
      data.implementationStatus,
      IMPLEMENTATION_STATUSES,
      EMPTY_MECHANIC.implementationStatus,
    ),
    tuningParameters: readParameters(entity),
  };
}

/**
 * The `data` to PATCH for a change to some of those fields.
 *
 * The API replaces `data` wholesale, so everything else the entity carries —
 * the rationale document, fields a later issue adds — is spread back in.
 */
export function writeMechanic(
  entity: Entity,
  patch: Partial<MechanicData>,
): Record<string, unknown> {
  return { ...entity.data, ...readMechanic(entity), ...patch };
}

export interface MechanicNarrowing {
  area?: MechanicArea;
  implementationStatus?: ImplementationStatus;
}

/**
 * Narrows a listing by the fields that live in `data`.
 *
 * The listing endpoint filters on the entity's own columns — type, status,
 * tags, name — and cannot reach inside JSONB, so area and implementation
 * status are applied here over the page the browser already holds.
 */
export function narrowMechanics(
  entities: readonly Entity[],
  narrowing: MechanicNarrowing,
): Entity[] {
  return entities.filter((entity) => {
    const mechanic = readMechanic(entity);
    if (narrowing.area && mechanic.area !== narrowing.area) return false;
    if (
      narrowing.implementationStatus &&
      mechanic.implementationStatus !== narrowing.implementationStatus
    ) {
      return false;
    }
    return true;
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
