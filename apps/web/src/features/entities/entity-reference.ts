import type { Entity, EntityType } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';

/** Node names, shared by the extensions, the commands and the tests. */
export const ENTITY_MENTION_NODE = 'entityMention';
export const ENTITY_EMBED_NODE = 'entityEmbed';

/**
 * The kinds of entity a design document can point at.
 *
 * Deliberately not every `EntityType`: a document referring to another
 * document, a build or an asset reference is not something the writing surface
 * offers, and a shorter list keeps the `@` search and the `/` menu readable.
 */
export const REFERENCEABLE_ENTITY_TYPES = [
  'character',
  'mechanic',
  'location',
  'region',
  'faction',
  'culture',
  'technology',
  'lore',
  'event',
  'hazard',
  'system',
  'design_pillar',
  'prototype',
] as const satisfies readonly EntityType[];

/**
 * What a mention or an embed stores.
 *
 * The id is the reference — never a copy of the entity — so renaming the
 * entity changes what the document *shows* without rewriting its JSON.
 * `label` is the display text: it is written when the reference is inserted
 * and is only read when the entity cannot be resolved, so a reference to a
 * deleted entity still says which one it was.
 */
export interface EntityReferenceAttributes {
  entityId: string | null;
  entityType: EntityType | null;
  label: string | null;
}

/**
 * A reference resolved against the project's current entities. `loading` and
 * `missing` are told apart so a document that is still fetching does not flash
 * every reference as broken.
 */
export type ResolvedEntityReference =
  { state: 'loading' } | { state: 'found'; entity: Entity } | { state: 'missing' };

export function resolveEntityReference(
  entityId: string | null,
  entities: Entity[],
  isPending: boolean,
): ResolvedEntityReference {
  if (!entityId) return { state: 'missing' };

  const entity = entities.find((candidate) => candidate.id === entityId);
  if (entity) return { state: 'found', entity };

  return isPending ? { state: 'loading' } : { state: 'missing' };
}

/** The text a reference shows: the entity's current name, or the stored label until it resolves. */
export function entityReferenceLabel(
  resolved: ResolvedEntityReference,
  storedLabel: string | null,
): string | null {
  return resolved.state === 'found' ? resolved.entity.name : storedLabel;
}

/**
 * The entities a set of reference nodes points at.
 *
 * The editor hands over the mention nodes inside a passage without knowing
 * what they are; this reads the ids back out, so an AI request about that
 * passage names the entities it mentions as deliberate context rather than
 * hoping the relationship walk finds them.
 */
export function referencedEntityIds(nodes: JSONContent[]): string[] {
  const ids = nodes
    .map((node) => node.attrs?.entityId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return [...new Set(ids)];
}

export interface EntitySearchOptions {
  /** Restricts the results to one entity type — how the `/` embed pickers scope themselves. */
  type?: EntityType;
  limit?: number;
}

/**
 * The scoped search behind `@` and the embed pickers.
 *
 * Archived entities are left out: you can keep a reference to something that
 * was archived, but you should not be able to write a new one.
 */
export function matchEntities(
  entities: Entity[],
  query: string,
  { type, limit = 8 }: EntitySearchOptions = {},
): Entity[] {
  const needle = query.trim().toLowerCase();

  return entities
    .filter((entity) => entity.status !== 'archived')
    .filter((entity) => (type ? entity.type === type : isReferenceableType(entity.type)))
    .filter((entity) => entity.name.toLowerCase().includes(needle))
    .sort((a, b) => rank(a, needle) - rank(b, needle) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Names that start with what was typed come first; everything else keeps alphabetical order. */
function rank(entity: Entity, needle: string): number {
  return entity.name.toLowerCase().startsWith(needle) ? 0 : 1;
}

function isReferenceableType(type: EntityType): boolean {
  return (REFERENCEABLE_ENTITY_TYPES as readonly EntityType[]).includes(type);
}

/**
 * The attribute definitions both reference nodes share, in TipTap's shape.
 *
 * Everything is written to a `data-*` attribute so the reference survives a
 * copy/paste through the clipboard's HTML as well as through stored JSON.
 */
export function referenceAttributes() {
  return {
    entityId: dataAttribute('entityId', 'data-entity-id'),
    entityType: dataAttribute('entityType', 'data-entity-type'),
    label: dataAttribute('label', 'data-label'),
  };
}

function dataAttribute(name: keyof EntityReferenceAttributes, attribute: string) {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] ? { [attribute]: attributes[name] } : {},
  };
}
