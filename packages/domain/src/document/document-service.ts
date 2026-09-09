import { snapshotEntity, type Entity } from '../entity/entity';
import { type EntityListFilter, type EntityPage } from '../entity/entity-repository';
import { type EntityService } from '../entity/entity-service';
import { ValidationError } from '../shared/errors';
import { optionalText, requireOneOf } from '../shared/validation';
import { diffSnapshots, type FieldChange } from '../version/compare';
import { type EntityVersion, type VersionReason } from '../version/entity-version';
import { type EntityVersionService } from '../version/entity-version-service';
import {
  DOCUMENT_CONTENT_KEY,
  DOCUMENT_VERSION_GENERATION_KEY,
  DOCUMENT_VERSION_NAME_KEY,
  DOCUMENT_VERSION_REASONS,
  MAX_DOCUMENT_VERSION_NAME_LENGTH,
  documentContent,
  documentData,
  documentVersionGenerationId,
  documentVersionName,
  emptyDocumentContent,
  requireDocumentContent,
  type DocumentContent,
  type DocumentVersionReason,
} from './document';

/** How the body reads as a comparison field, e.g. `data.content`. */
const CONTENT_FIELD = `data.${DOCUMENT_CONTENT_KEY}`;

export interface CreateDocumentInput {
  name: string;
  description?: string | null;
  tags?: string[];
  /** Starting body. Defaults to an empty document. */
  content?: DocumentContent;
}

export interface SnapshotDocumentInput {
  /** Label for the snapshot, e.g. "Vertical slice review". */
  name?: string | null;
  reason?: DocumentVersionReason;
  /** The generation behind an `ai_edit`, so the version says where it came from. */
  generationId?: string | null;
  createdBy?: string | null;
}

export interface RestoreDocumentVersionInput {
  createdBy?: string | null;
}

/** One entry in a document's history, without the body it holds. */
export interface DocumentVersion {
  id: string;
  documentId: string;
  /** Monotonic within the document, starting at 1. */
  versionNumber: number;
  /** Label the snapshot was taken under, or null when it was unnamed. */
  name: string | null;
  /** Why the version exists — `restore` is recorded by restoring, never asked for. */
  reason: VersionReason;
  /** The generation an accepted AI edit came from; null for every other version. */
  generationId: string | null;
  parentVersionId: string | null;
  createdBy: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

/** A history entry with the body it holds — enough to preview or compare it. */
export interface DocumentVersionSnapshot extends DocumentVersion {
  /** The document's title as it stood at this version. */
  title: string;
  content: DocumentContent;
}

/** A document as an editor loads it: the working copy and where it sits in history. */
export interface Document {
  entity: Entity;
  content: DocumentContent;
  /** The most recent snapshot, or null while the document has none. */
  currentVersion: DocumentVersion | null;
  /**
   * Whether autosaved work has moved on from `currentVersion`.
   *
   * False while a document has no versions at all: there is nothing yet for
   * the working copy to differ from.
   */
  hasUnversionedChanges: boolean;
}

export interface DocumentHistory {
  documentId: string;
  currentVersionId: string | null;
  versions: DocumentVersion[];
  total: number;
}

export interface DocumentVersionComparison {
  from: DocumentVersionSnapshot;
  to: DocumentVersionSnapshot;
  /**
   * Everything that changed apart from the body, field by field — `name` here
   * is the document's title, not a snapshot label. The bodies themselves come
   * back on `from` and `to` for a side-by-side view.
   */
  changes: FieldChange[];
  contentChanged: boolean;
}

/**
 * Rich-text documents — GDDs, briefs, write-ups — and their history.
 *
 * A document is an ordinary `Entity` of type `document`: one identity, one
 * lifecycle, one place to look, with its body as structured JSON in `data`.
 * Its history is the entity's own `EntityVersion` history, so this service
 * adds no store of its own.
 *
 * The two ideas the editor needs kept apart:
 *
 * - **Autosave** (`saveContent`) writes the working copy and nothing else, so
 *   a writer pausing for breath never adds a row to a history list. Undo and
 *   redo stay the editor's, and never travel through here.
 * - **Snapshots** (`snapshot`) are the deliberate acts a user would recognise
 *   later: a named version, an accepted AI edit, a milestone, a playtest.
 *
 * Restoring appends like every other version, so the work done after the
 * restored point is still there and still reachable.
 */
export class DocumentService {
  constructor(
    private readonly entities: EntityService,
    private readonly versions: EntityVersionService,
  ) {}

  async create(projectId: string, input: CreateDocumentInput): Promise<Document> {
    const content =
      input.content === undefined
        ? emptyDocumentContent()
        : requireDocumentContent('content', input.content);

    const entity = await this.entities.create(projectId, {
      type: 'document',
      name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
      data: documentData(content),
    });

    return this.load(projectId, entity);
  }

  /** The project's documents, newest first. Reading one is `getById`. */
  async list(projectId: string, filter: Omit<EntityListFilter, 'types'> = {}): Promise<EntityPage> {
    return this.entities.listByType(projectId, 'document', filter);
  }

  async getById(projectId: string, documentId: string): Promise<Document> {
    return this.load(projectId, await this.requireDocument(projectId, documentId));
  }

  /**
   * Autosave: replaces the body, deliberately writing no version.
   *
   * The rest of the entity's `data` is carried over, so a document can hold
   * more than its body without autosave erasing it.
   */
  async saveContent(projectId: string, documentId: string, content: unknown): Promise<Document> {
    const entity = await this.requireDocument(projectId, documentId);
    const saved = await this.entities.update(projectId, entity.id, {
      data: documentData(requireDocumentContent('content', content), entity.data),
    });

    return this.load(projectId, saved);
  }

  /** Records the current body as a permanent version a user can come back to. */
  async snapshot(
    projectId: string,
    documentId: string,
    input: SnapshotDocumentInput = {},
  ): Promise<DocumentVersion> {
    const entity = await this.requireDocument(projectId, documentId);
    const name = optionalText('name', input.name, MAX_DOCUMENT_VERSION_NAME_LENGTH);
    const generationId = optionalText('generationId', input.generationId, 200);

    const version = await this.versions.commit(projectId, entity.id, {
      reason: requireOneOf('reason', input.reason ?? 'manual', DOCUMENT_VERSION_REASONS),
      metadata: {
        ...(name === null ? {} : { [DOCUMENT_VERSION_NAME_KEY]: name }),
        ...(generationId === null ? {} : { [DOCUMENT_VERSION_GENERATION_KEY]: generationId }),
      },
      createdBy: input.createdBy,
    });

    return toDocumentVersion(version, version.id);
  }

  /** The history list: version metadata only, without a body per entry. */
  async listVersions(
    projectId: string,
    documentId: string,
    filter: { limit?: number; offset?: number } = {},
  ): Promise<DocumentHistory> {
    const entity = await this.requireDocument(projectId, documentId);
    const page = await this.versions.list(projectId, entity.id, filter);

    return {
      documentId: entity.id,
      currentVersionId: entity.currentVersionId,
      versions: page.items.map((version) => toDocumentVersion(version, entity.currentVersionId)),
      total: page.total,
    };
  }

  /** One version with the body it holds, for a preview before restoring. */
  async getVersion(
    projectId: string,
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionSnapshot> {
    const entity = await this.requireDocument(projectId, documentId);
    const version = await this.requireVersionOf(projectId, entity, versionId);

    return toDocumentVersionSnapshot(version, entity.currentVersionId);
  }

  /**
   * Two versions side by side: both bodies, plus what else changed between
   * them field by field.
   *
   * The bodies are handed over whole rather than diffed — prose is compared by
   * reading it, and the structured form is what a side-by-side view renders.
   */
  async compareVersions(
    projectId: string,
    documentId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<DocumentVersionComparison> {
    const entity = await this.requireDocument(projectId, documentId);
    const [from, to] = await Promise.all([
      this.requireVersionOf(projectId, entity, fromVersionId),
      this.requireVersionOf(projectId, entity, toVersionId),
    ]);

    const changes = diffSnapshots(from.snapshot, to.snapshot);

    return {
      from: toDocumentVersionSnapshot(from, entity.currentVersionId),
      to: toDocumentVersionSnapshot(to, entity.currentVersionId),
      changes: changes.filter((change) => change.field !== CONTENT_FIELD),
      contentChanged: changes.some((change) => change.field === CONTENT_FIELD),
    };
  }

  /**
   * Brings a version's body back as the working copy, recorded as a *new*
   * version. Everything written after the restored point stays in the history.
   */
  async restoreVersion(
    projectId: string,
    documentId: string,
    versionId: string,
    input: RestoreDocumentVersionInput = {},
  ): Promise<DocumentVersion> {
    const entity = await this.requireDocument(projectId, documentId);
    const version = await this.requireVersionOf(projectId, entity, versionId);

    const restored = await this.versions.restoreVersion(projectId, version.id, {
      createdBy: input.createdBy,
    });

    return toDocumentVersion(restored, restored.id);
  }

  private async load(projectId: string, entity: Entity): Promise<Document> {
    const current = entity.currentVersionId
      ? await this.versions.getById(projectId, entity.currentVersionId)
      : null;

    return {
      entity,
      content: documentContent(entity),
      currentVersion: current ? toDocumentVersion(current, entity.currentVersionId) : null,
      hasUnversionedChanges:
        current !== null && diffSnapshots(current.snapshot, snapshotEntity(entity)).length > 0,
    };
  }

  private async requireDocument(projectId: string, documentId: string): Promise<Entity> {
    const entity = await this.entities.getById(projectId, documentId);

    if (entity.type !== 'document') {
      throw new ValidationError('That entity is not a document', {
        entityId: entity.id,
        type: entity.type,
      });
    }
    return entity;
  }

  private async requireVersionOf(
    projectId: string,
    entity: Entity,
    versionId: string,
  ): Promise<EntityVersion> {
    const version = await this.versions.getById(projectId, versionId);

    if (version.entityId !== entity.id) {
      throw new ValidationError('The version does not belong to this document', {
        documentId: entity.id,
        versionId,
      });
    }
    return version;
  }
}

function toDocumentVersion(
  version: EntityVersion,
  currentVersionId: string | null,
): DocumentVersion {
  return {
    id: version.id,
    documentId: version.entityId,
    versionNumber: version.versionNumber,
    name: documentVersionName(version),
    reason: version.reason,
    generationId: documentVersionGenerationId(version),
    parentVersionId: version.parentVersionId,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    isCurrent: version.id === currentVersionId,
  };
}

function toDocumentVersionSnapshot(
  version: EntityVersion,
  currentVersionId: string | null,
): DocumentVersionSnapshot {
  return {
    ...toDocumentVersion(version, currentVersionId),
    title: version.snapshot.name,
    content: documentContent(version.snapshot),
  };
}
