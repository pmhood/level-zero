import type { Entity, EntityType } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';

import { entityRoute } from '@/features/entity-detail/entity-route';

import { entityTypeLabel } from './entity-presentation';

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
 * Resolves a mention or embed against the entities as they stand at export
 * time — an export has no "loading" state, only found or not.
 */
export function resolveReferenceForExport(
  entityId: string | null,
  entities: readonly Entity[],
): Entity | undefined {
  return entityId ? entities.find((entity) => entity.id === entityId) : undefined;
}

/** What a reference resolves to for export: a name to show, and whether it is honest to link it. */
export interface EntityReferenceExport {
  /** The entity's current name, the stored label, or a generic placeholder — never blank. */
  name: string;
  archived: boolean;
  /** No live entity to point at: deleted, or (an embed only) never filled in. */
  missing: boolean;
}

/**
 * The single description entity mentions and embeds export from: their node
 * attrs plus the project's entities as they stand right now. Both nodes
 * render this differently (inline text versus a card), but neither node
 * decides on its own whether a reference is honest — this does, once, so
 * Markdown and HTML can't disagree about it.
 */
export function describeReferenceForExport(
  attrs: EntityReferenceAttributes,
  entities: readonly Entity[],
): EntityReferenceExport {
  const entity = resolveReferenceForExport(attrs.entityId, entities);
  if (entity) return { name: entity.name, archived: entity.status === 'archived', missing: false };

  const kind = (attrs.entityType ? entityTypeLabel(attrs.entityType) : 'Entity').toLowerCase();
  if (!attrs.entityId) return { name: `No ${kind} chosen`, archived: false, missing: true };

  // The stored label survives even once the entity it named is gone, so a
  // reader sees *which* character or mechanic went missing, not just that
  // one did.
  const name = attrs.label ? `Missing ${kind}: ${attrs.label}` : `Missing ${kind}`;
  return { name, archived: false, missing: true };
}

/**
 * Replaces one mention or embed node with plain nodes every renderer already
 * knows how to serialise: linked text for a mention, and a small blockquote
 * card — a linked heading plus the entity's description, if it has one —
 * for an embed.
 *
 * This is a deliberate alternative to teaching `EntityMention`/`EntityEmbed`
 * to resolve entities themselves for export. `@tiptap/markdown`'s
 * `renderMarkdown` extension field is called with no `this` bound to the
 * node's configured options — unlike `renderHTML`, which the schema builds
 * with `options` in context — so a resolver has nowhere reliable to live on
 * the node itself. Ordinary text, marks and blockquotes don't have that
 * problem, and resolving up front also means Markdown and HTML render from
 * the exact same decision about what a reference says.
 */
export function referenceNodeForExport(
  node: JSONContent,
  entities: readonly Entity[],
  projectId: string,
): JSONContent {
  const attrs = (node.attrs ?? {}) as EntityReferenceAttributes;
  const info = describeReferenceForExport(attrs, entities);
  const href = !info.missing && attrs.entityId ? entityRoute(projectId, attrs.entityId) : null;
  const label = info.archived ? `${info.name} (archived)` : info.name;
  const linkMarks = href ? [{ type: 'link', attrs: { href } }] : [];

  const nameText: JSONContent = { type: 'text', text: label, marks: linkMarks };
  if (node.type === ENTITY_MENTION_NODE) return nameText;

  const entity = resolveReferenceForExport(attrs.entityId, entities);
  const kind = attrs.entityType ? entityTypeLabel(attrs.entityType) : 'Entity';
  const heading: JSONContent = {
    type: 'paragraph',
    content: [nameText, { type: 'text', text: ` — ${kind}` }],
  };
  const content = [heading];
  if (entity?.description) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: entity.description }] });
  }

  return { type: 'blockquote', content };
}

/**
 * Walks a document top to bottom, replacing every mention and embed with
 * `referenceNodeForExport`'s plain-node equivalent, so the Markdown and HTML
 * renderers — which know nothing about entities — never see the custom node
 * types at all.
 */
export function resolveEntityReferencesForExport(
  content: JSONContent,
  entities: readonly Entity[],
  projectId: string,
): JSONContent {
  function walk(node: JSONContent): JSONContent {
    if (node.type === ENTITY_MENTION_NODE || node.type === ENTITY_EMBED_NODE) {
      return referenceNodeForExport(node, entities, projectId);
    }
    if (!Array.isArray(node.content)) return node;
    return { ...node, content: node.content.map(walk) };
  }

  return walk(content);
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
