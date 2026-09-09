import type { Entity, EntityType, RelationType } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * The setting's canonical entity types (UX spec, "World" — entity categories).
 *
 * These are ordinary entities: the World workspace is a view over the same
 * rows every other tool reads, so a faction linked from the GDD or from a
 * character is this faction, not a copy of it.
 *
 * Maps are deliberately absent. A map is an `asset_reference` entity, and a
 * place points at one with a `references` edge rather than the World browser
 * listing every asset reference in the project.
 */
export const WORLD_ENTITY_TYPES = [
  'region',
  'location',
  'faction',
  'culture',
  'technology',
  'event',
  'hazard',
  'lore',
] as const satisfies readonly EntityType[];

export type WorldEntityType = (typeof WORLD_ENTITY_TYPES)[number];

export function isWorldEntity(entity: Entity): boolean {
  return (WORLD_ENTITY_TYPES as readonly EntityType[]).includes(entity.type);
}

/** The places the setting is made of — what a region or a location can hold. */
export const WORLD_PLACE_TYPES = ['region', 'location'] as const satisfies readonly EntityType[];

export function isWorldPlace(entity: Entity): boolean {
  return (WORLD_PLACE_TYPES as readonly EntityType[]).includes(entity.type);
}

/**
 * The edges a world designer draws by hand.
 *
 * Lineage relations are left out — they record how something came to exist and
 * are written by promotion and generation, never chosen from a menu — as are
 * the system-shaped relations (`depends_on`, `implements`) that say nothing
 * about a setting.
 */
export const WORLD_LINK_RELATIONS = [
  'controls',
  'belongs_to',
  'contains',
  'appears_in',
  'references',
] as const satisfies readonly RelationType[];

/**
 * How settled a piece of the setting is.
 *
 * Separate from `Entity.status`, which is the entity's lifecycle: a location
 * can be an active part of the project and still be a proposal nobody has
 * agreed to, and a contested fact is one the team is still arguing about
 * rather than one that has been archived.
 */
export const CANON_STATUSES = ['proposed', 'canon', 'contested', 'retired'] as const;

export type CanonStatus = (typeof CANON_STATUSES)[number];

const CANON_STATUS_BADGES: Record<CanonStatus, { label: string; tone: StatusTone }> = {
  proposed: { label: 'Proposed', tone: 'neutral' },
  canon: { label: 'Canon', tone: 'success' },
  contested: { label: 'Contested', tone: 'warning' },
  retired: { label: 'Retired', tone: 'error' },
};

export function canonStatusBadge(status: CanonStatus): { label: string; tone: StatusTone } {
  return CANON_STATUS_BADGES[status];
}

/** How dangerous a place is, or how bad a hazard or an event gets. */
export const WORLD_RISKS = ['none', 'low', 'moderate', 'high', 'extreme'] as const;

export type WorldRisk = (typeof WORLD_RISKS)[number];

const RISK_LABELS: Record<WorldRisk, string> = {
  none: 'No risk noted',
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  extreme: 'Extreme risk',
};

export function riskLabel(risk: WorldRisk): string {
  return RISK_LABELS[risk];
}

/** The field of a world entity's `data` its long-form lore is stored in. */
export const WORLD_LORE_FIELD = 'lore';

/**
 * The structured part of a world entity, as stored in the entity's `data`.
 *
 * One shape for all eight types rather than eight bespoke ones: every piece of
 * a setting sits somewhere in its history (`era`), is either agreed or not
 * (`canonStatus`), and is either dangerous or not (`risk`). A culture with no
 * risk simply says nothing about it.
 *
 * Deliberately not here: relationships, which are edges rather than fields;
 * tags, which are the entity's own and carry the environment vocabulary; and
 * the lore document, which is TipTap JSON read through `entityDocument`.
 */
export interface WorldData {
  /** Where in the setting's history this sits — "c. 2226", "Third Age". */
  era: string;
  canonStatus: CanonStatus;
  risk: WorldRisk;
}

const EMPTY_WORLD_DATA: WorldData = { era: '', canonStatus: 'proposed', risk: 'none' };

/**
 * Reads a world entity's structured fields out of `data`.
 *
 * Anything missing or of the wrong shape reads as its empty value: `data` is
 * schemaless by design, so an entity promoted from an idea — which has none of
 * these fields — has to open in the editor rather than fail in it.
 */
export function readWorld(entity: Entity): WorldData {
  const data = entity.data;

  return {
    era: typeof data.era === 'string' ? data.era : '',
    canonStatus: oneOf(data.canonStatus, CANON_STATUSES, EMPTY_WORLD_DATA.canonStatus),
    risk: oneOf(data.risk, WORLD_RISKS, EMPTY_WORLD_DATA.risk),
  };
}

/**
 * The `data` to PATCH for a change to some of those fields.
 *
 * The API replaces `data` wholesale, so everything else the entity carries —
 * its lore document, fields another tool wrote — is spread back in.
 */
export function writeWorld(entity: Entity, patch: Partial<WorldData>): Record<string, unknown> {
  return { ...entity.data, ...readWorld(entity), ...patch };
}

export interface WorldNarrowing {
  type?: WorldEntityType;
  canonStatus?: CanonStatus;
  tag?: string;
}

/**
 * Narrows a listing by type, canon status and tag.
 *
 * The listing endpoint filters on the entity's own columns but cannot reach
 * inside JSONB, and the workspace already holds every world entity for the
 * dashboard, so all three are applied here over the page in hand.
 */
export function narrowWorldEntities(
  entities: readonly Entity[],
  narrowing: WorldNarrowing,
): Entity[] {
  return entities.filter((entity) => {
    if (narrowing.type && entity.type !== narrowing.type) return false;
    if (narrowing.tag && !entity.tags.includes(narrowing.tag)) return false;
    if (narrowing.canonStatus && readWorld(entity).canonStatus !== narrowing.canonStatus) {
      return false;
    }
    return true;
  });
}

/**
 * The setting's history, earliest first.
 *
 * `era` is free text because a setting's calendar is its own invention, so it
 * is compared numerically-aware — "c. 2180" before "c. 2226" — and anything
 * undated sorts to the end, where it reads as work still to do.
 */
export function orderByEra(entities: readonly Entity[]): Entity[] {
  return [...entities].sort((a, b) => {
    const eraA = readWorld(a).era;
    const eraB = readWorld(b).era;
    if (!eraA !== !eraB) return eraA ? -1 : 1;
    return (
      eraA.localeCompare(eraB, undefined, { numeric: true, sensitivity: 'base' }) ||
      a.name.localeCompare(b.name)
    );
  });
}

export interface WorldTagCount {
  tag: string;
  count: number;
}

/**
 * The environment vocabulary the project has actually used: every tag on a
 * world entity, commonest first.
 *
 * Tags are the existing taxonomy field, so "Vacuum" or "Low gravity" is one
 * word shared across the hazards, regions and locations it applies to rather
 * than a parallel list of environment records.
 */
export function environmentTags(entities: readonly Entity[]): WorldTagCount[] {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    for (const tag of entity.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
