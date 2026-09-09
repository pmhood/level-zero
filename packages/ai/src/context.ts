import {
  type AssetKind,
  type EntityStatus,
  type EntityType,
  type RelationType,
} from '@level-zero/domain';

/**
 * How an object came to be in the context.
 *
 * The order is how deliberate the inclusion was: `selected` and `mention` are
 * things the user pointed at, `related` is what the relationship graph pulled
 * in around them, and `reference` and `lineage` are the files and the earlier
 * generation the request leans on.
 */
export const CONTEXT_SOURCES = ['selected', 'mention', 'related', 'reference', 'lineage'] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/** Default hops followed out from the entities the user named. */
export const DEFAULT_CONTEXT_DEPTH = 1;
/** Default ceiling on entities, so a hub entity cannot flood the context window. */
export const DEFAULT_MAX_CONTEXT_ENTITIES = 40;
export const MAX_CONTEXT_DEPTH = 3;
export const MAX_CONTEXT_ENTITIES = 200;
/** Longest run of document text carried per section. */
export const MAX_CONTEXT_SECTION_LENGTH = 2000;

/**
 * What a feature asks the resolver to assemble.
 *
 * Everything is optional except the instruction: a request with no entities is
 * a valid one, and resolves to the project plus the user's words.
 */
export interface ContextRequest {
  /** The user's request, verbatim. */
  instruction: string;
  /** Entities the user had selected when they asked. */
  selectedEntityIds?: readonly string[];
  /** Entities named inline, e.g. by an `@mention` in the editor. */
  mentionedEntityIds?: readonly string[];
  /** Assets chosen as references: a style plate, a pose, a palette. */
  assetIds?: readonly string[];
  /** Hops to follow out from the named entities. Defaults to one; `0` disables. */
  relatedDepth?: number;
  /** Restricts the walk to these relations. Every relation is followed by default. */
  relations?: readonly RelationType[];
  /** The generation this request refines, whose provenance is worth carrying. */
  parentGenerationId?: string;
  maxEntities?: number;
}

/** A run of document body under one heading, so a section can be named. */
export interface ContextDocumentSection {
  /** Empty for the run before the document's first heading. */
  heading: string;
  text: string;
}

export interface ContextEntity {
  id: string;
  type: EntityType;
  name: string;
  description: string | null;
  status: EntityStatus;
  tags: string[];
  source: ContextSource;
  /** Relationship hops from a named entity; `0` for the named ones themselves. */
  distance: number;
  /** The edge this entity was reached through, e.g. `appears_in` — null at distance 0. */
  relation: RelationType | null;
  /** The entity on the other end of that edge. */
  viaEntityId: string | null;
  /** Body sections, for `document` entities only. */
  sections?: ContextDocumentSection[];
}

export interface ContextAsset {
  id: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  source: ContextSource;
}

/** The generation this request continues from, summarised. */
export interface ContextLineage {
  generationId: string;
  capability: string;
  provider: string | null;
  model: string | null;
  prompt: string;
  outputAssetIds: string[];
}

/**
 * The project material assembled for one AI request.
 *
 * Every member says where it came from, which is what makes an assembled
 * context inspectable: a debug view, a log line or a stored provenance record
 * can all say "this character came in because it is one `appears_in` hop from
 * the location you selected" rather than only listing ids.
 */
export interface ResolvedContext {
  project: { id: string; name: string; description: string | null };
  instruction: string;
  entities: ContextEntity[];
  assets: ContextAsset[];
  lineage: ContextLineage | null;
  /** True when the entity ceiling stopped the walk before it ran out of graph. */
  truncated: boolean;
}

/**
 * Reads a stored context snapshot back.
 *
 * Snapshots are persisted as plain JSON on the generation record, so this is
 * the one place that decides whether a stored value is still usable. Anything
 * that is not a resolved context reads as `undefined` rather than reaching a
 * provider and failing there.
 */
export function readResolvedContext(value: unknown): ResolvedContext | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  const candidate = value as Partial<ResolvedContext>;
  if (typeof candidate.project !== 'object' || candidate.project === null) return undefined;
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.assets)) return undefined;

  return candidate as ResolvedContext;
}

/**
 * Renders a resolved context as the plain-text briefing a model reads.
 *
 * Provider-agnostic on purpose: an adapter decides *where* this goes — a
 * system prompt, a prefix, a separate turn — but not what the project looks
 * like written down.
 */
export function renderContext(context: ResolvedContext): string {
  const blocks: string[] = [
    `Project: ${context.project.name}${
      context.project.description ? `\n${context.project.description}` : ''
    }`,
  ];

  if (context.entities.length > 0) {
    blocks.push(['Project objects in scope:', ...context.entities.map(renderEntity)].join('\n'));
  }

  if (context.assets.length > 0) {
    blocks.push(
      [
        'Reference files:',
        ...context.assets.map((asset) => `- ${asset.filename} (${asset.kind}, ${asset.mimeType})`),
      ].join('\n'),
    );
  }

  if (context.lineage) {
    blocks.push(
      `Continues generation ${context.lineage.generationId} (${context.lineage.capability}):\n${context.lineage.prompt}`,
    );
  }

  return blocks.join('\n\n');
}

function renderEntity(entity: ContextEntity): string {
  const provenance =
    entity.distance === 0
      ? entity.source
      : `${entity.source} via ${entity.relation ?? 'relationship'}`;

  const lines = [
    `- ${entity.name} [${entity.type}] (${provenance})`,
    ...(entity.description ? [`  ${entity.description}`] : []),
    ...(entity.tags.length > 0 ? [`  tags: ${entity.tags.join(', ')}`] : []),
    ...(entity.sections ?? []).map(
      (section) => `  ${section.heading ? `## ${section.heading}\n  ` : ''}${section.text}`,
    ),
  ];

  return lines.join('\n');
}
