import { createHash } from 'node:crypto';

import { type Asset } from '../asset/asset';
import { documentContent, documentPlainText } from '../document/document';
import { type Entity } from '../entity/entity';
import { type EntityType } from '../entity/entity-type';
import { type Generation } from '../generation/generation';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';

/**
 * The canonical records the index mirrors.
 *
 * Documents, prototypes and builds are absent on purpose: they are `Entity`
 * rows of their own type, so they are indexed as entities and told apart by
 * `entityType`. Duplicating entity identity here is the thing the entity model
 * exists to prevent.
 */
export const SEARCH_SOURCE_TYPES = ['entity', 'asset', 'generation'] as const;
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

/** How much of the body a result carries back for a preview. */
export const SEARCH_EXCERPT_LENGTH = 240;

/**
 * The searchable copy of one canonical project object.
 *
 * A search document is *derived*: it holds no creative content of its own and
 * can be rebuilt from the row it mirrors at any time, which is why it is not an
 * `Entity`. What it adds is the flattened text one query can match across
 * entities, assets and generations at once, and the vector that answers a
 * question the words themselves do not.
 *
 * `sourceType` plus `sourceId` names the record a hit came from, and
 * `sourceVersionId` records which version of it was indexed, so a match always
 * traces back to something canonical rather than to a copy that has drifted.
 */
export interface SearchDocument {
  id: string;
  projectId: string;
  sourceType: SearchSourceType;
  /** Primary key of the canonical row: an entity, asset or generation id. */
  sourceId: string;
  /** The entity's type, for entity rows. Null for assets and generations. */
  entityType: EntityType | null;
  /** The source's own status, so archived material can be filtered out. */
  status: string;
  tags: string[];
  title: string;
  /** Everything else worth matching, flattened to plain text. */
  body: string;
  /** Fingerprint of the indexed text; the vector is stale when it has moved on. */
  contentHash: string;
  /** Unit-length vector for semantic retrieval, or null until one is built. */
  embedding: number[] | null;
  /** Which model produced `embedding`: vectors from different models are not comparable. */
  embeddingModel: string | null;
  /** The `contentHash` the current embedding was built from. */
  embeddedHash: string | null;
  /** The source's version pointer when it was indexed, when it has one. */
  sourceVersionId: string | null;
  /** When the source itself last changed, which is what date filters mean. */
  sourceUpdatedAt: Date;
  indexedAt: Date;
}

export interface SearchDocumentFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function searchDocumentForEntity(
  entity: Entity,
  deps: SearchDocumentFactoryDeps,
): SearchDocument {
  return build(deps, {
    projectId: entity.projectId,
    sourceType: 'entity',
    sourceId: entity.id,
    entityType: entity.type,
    status: entity.status,
    tags: [...entity.tags],
    title: entity.name,
    // A document entity's body lives in `data.content`; every other type reads
    // back as empty, so one rule covers a GDD, an idea's notes and a character.
    body: joinText([
      entity.description,
      documentPlainText(documentContent(entity)),
      entity.tags.join(' '),
    ]),
    sourceVersionId: entity.currentVersionId,
    sourceUpdatedAt: entity.updatedAt,
  });
}

export function searchDocumentForAsset(
  asset: Asset,
  deps: SearchDocumentFactoryDeps,
): SearchDocument {
  return build(deps, {
    projectId: asset.projectId,
    sourceType: 'asset',
    sourceId: asset.id,
    entityType: null,
    status: asset.status,
    tags: [],
    title: asset.filename,
    body: joinText([asset.kind, asset.mimeType]),
    sourceVersionId: null,
    sourceUpdatedAt: asset.updatedAt,
  });
}

export function searchDocumentForGeneration(
  generation: Generation,
  deps: SearchDocumentFactoryDeps,
): SearchDocument {
  return build(deps, {
    projectId: generation.projectId,
    sourceType: 'generation',
    sourceId: generation.id,
    entityType: null,
    status: generation.status,
    tags: [],
    // The prompt is what a person would recognise a generation by.
    title: truncate(generation.prompt, 120),
    body: joinText([generation.prompt, generation.capability, generation.model]),
    sourceVersionId: null,
    sourceUpdatedAt: generation.completedAt ?? generation.createdAt,
  });
}

/** The text a vector is built from: the title carries as much meaning as the body. */
export function embeddableText(document: Pick<SearchDocument, 'title' | 'body'>): string {
  return joinText([document.title, document.body]);
}

type SearchDocumentContent = Omit<
  SearchDocument,
  'id' | 'contentHash' | 'embedding' | 'embeddingModel' | 'embeddedHash' | 'indexedAt'
>;

function build(deps: SearchDocumentFactoryDeps, content: SearchDocumentContent): SearchDocument {
  return {
    ...content,
    id: deps.ids.next(),
    contentHash: hashContent(content.title, content.body),
    embedding: null,
    embeddingModel: null,
    embeddedHash: null,
    indexedAt: deps.clock.now(),
  };
}

/** Identifies the indexed text, so an unchanged body never pays for a re-embedding. */
function hashContent(title: string, body: string): string {
  return createHash('sha256').update(`${title}\n${body}`).digest('hex');
}

function joinText(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('\n');
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
}
