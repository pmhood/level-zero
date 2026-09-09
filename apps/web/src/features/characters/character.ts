import type { Entity, EntityStatus, EntityType } from '@level-zero/domain';

/** Characters are ordinary canonical entities; the studio is a view over them. */
export const CHARACTER_ENTITY_TYPE = 'character' satisfies EntityType;

/**
 * The two rich-text fields a character carries, both TipTap JSON in `data`.
 *
 * Background is canon — where they came from, who they were. Notes is the
 * working margin: open questions, casting thoughts, things to come back to.
 */
export const CHARACTER_BACKGROUND_FIELD = 'background';
export const CHARACTER_NOTES_FIELD = 'notes';

/**
 * One thing a character carries.
 *
 * Inventory is structured `data` rather than edges to item entities: there is
 * no `item` in `ENTITY_TYPES`, and what someone carries is a detail *of that
 * character* rather than an independently authored object other tools point
 * at. Anything that does become canon on its own — a signature weapon with a
 * mechanic behind it — is already a mechanic or a location, and belongs on the
 * Relationships tab where the graph holds it once.
 */
export interface InventoryItem {
  name: string;
  note: string;
}

/**
 * The structured part of a character, as stored in the entity's `data` JSONB.
 *
 * Deliberately not here: the relationship graph (factions, locations, the rest
 * of the cast), the `asset_reference` entities carrying the character's
 * visuals, and the two documents above — each read through the canonical
 * system that owns it rather than copied into this shape.
 */
export interface CharacterData {
  /** What they do in the world: "Salvager", "Broker". Project canon, not an enum. */
  role: string;
  /** A line in their own voice, shown under the name. */
  quote: string;
  traits: string[];
  /** What they are after, in a sentence or two. */
  motivation: string;
  inventory: InventoryItem[];
}

/**
 * Reads a character's structured fields out of `data`.
 *
 * Anything missing or of the wrong shape reads as its empty value: `data` is
 * schemaless by design, so a character promoted from an idea — which has none
 * of these fields — has to open in the editor rather than fail in it.
 */
export function readCharacter(entity: Entity): CharacterData {
  const data = entity.data;

  return {
    role: text(data.role),
    quote: text(data.quote),
    traits: stringList(data.traits),
    motivation: text(data.motivation),
    inventory: inventoryList(data.inventory),
  };
}

/**
 * The `data` to PATCH for a change to some of those fields.
 *
 * The API replaces `data` wholesale, so everything else the entity carries —
 * the background and notes documents, fields a later issue adds — is spread
 * back in.
 */
export function writeCharacter(
  entity: Entity,
  patch: Partial<CharacterData>,
): Record<string, unknown> {
  return { ...entity.data, ...readCharacter(entity), ...patch };
}

/** The lifecycle slice the browser shows. `cast` is everything not archived. */
export const CHARACTER_LIFECYCLES = ['cast', 'draft', 'active', 'archived'] as const;

export type CharacterLifecycle = (typeof CHARACTER_LIFECYCLES)[number];

const LIFECYCLE_LABELS: Record<CharacterLifecycle, string> = {
  cast: 'The whole cast',
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export function lifecycleLabel(lifecycle: CharacterLifecycle): string {
  return LIFECYCLE_LABELS[lifecycle];
}

/** The `status` filter to send the listing endpoint, or nothing for the whole cast. */
export function lifecycleStatuses(lifecycle: CharacterLifecycle): EntityStatus[] | undefined {
  return lifecycle === 'cast' ? undefined : [lifecycle];
}

export interface CharacterNarrowing {
  role?: string;
  tag?: string;
}

/**
 * Narrows a listing by role and tag, over the page the browser already holds.
 *
 * Role lives in JSONB and the listing endpoint cannot reach it. Tag *is* a
 * column, but filtering it server-side would collapse the filter bar's own
 * options down to the tags that co-occur with the chosen one, leaving no way
 * back out — so both are applied here, against one stable page of results.
 */
export function narrowCharacters(
  entities: readonly Entity[],
  narrowing: CharacterNarrowing,
): Entity[] {
  return entities.filter((entity) => {
    if (narrowing.role && readCharacter(entity).role !== narrowing.role) return false;
    if (narrowing.tag && !entity.tags.includes(narrowing.tag)) return false;
    return true;
  });
}

/** The roles present in a listing, for the browser's role filter. */
export function characterRoles(entities: readonly Entity[]): string[] {
  return sortedUnique(entities.map((entity) => readCharacter(entity).role));
}

/** The tags present in a listing, for the browser's tag filter. */
export function characterTags(entities: readonly Entity[]): string[] {
  return sortedUnique(entities.flatMap((entity) => entity.tags));
}

function sortedUnique(values: string[]): string[] {
  const present = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return [...new Set(present)].sort((a, b) => a.localeCompare(b));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** An entry without a name is not an item, so it is dropped rather than shown blank. */
function inventoryList(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const { name, note } = item as { name?: unknown; note?: unknown };
    return typeof name === 'string' ? [{ name, note: text(note) }] : [];
  });
}
