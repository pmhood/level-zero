import { type Activity } from '../activity/activity';
import {
  type ActivityListFilter,
  type ActivityPage,
  type ActivityRepository,
} from '../activity/activity-repository';
import { type Asset } from '../asset/asset';
import {
  type AssetListFilter,
  type AssetPage,
  type AssetRepository,
} from '../asset/asset-repository';
import {
  type GetUrlOptions,
  type ObjectStorageProvider,
  type PutObjectInput,
} from '../asset/object-storage';
import { type Entity } from '../entity/entity';
import {
  type EntityListFilter,
  type EntityPage,
  type EntityRepository,
} from '../entity/entity-repository';
import { type Generation } from '../generation/generation';
import {
  type GenerationListFilter,
  type GenerationPage,
  type GenerationRepository,
} from '../generation/generation-repository';
import { type Job } from '../job/job';
import { type JobEvents, type JobSubscription } from '../job/job-events';
import { type JobQueue } from '../job/job-queue';
import { type JobListFilter, type JobPage, type JobRepository } from '../job/job-repository';
import { type MoodboardConnector } from '../moodboard/moodboard-connector';
import { type MoodboardNode } from '../moodboard/moodboard-node';
import { type MoodboardRepository } from '../moodboard/moodboard-repository';
import { type Project } from '../project/project';
import { type PrototypeVersion } from '../prototype/prototype-version';
import {
  type PrototypeVersionListFilter,
  type PrototypeVersionPage,
  type PrototypeVersionRepository,
} from '../prototype/prototype-version-repository';
import { type EntityRelationship } from '../relationship/entity-relationship';
import {
  type EntityRelationshipRepository,
  type RelationshipListFilter,
  type RelationshipPage,
} from '../relationship/entity-relationship-repository';
import { type RelationType } from '../relationship/relation-type';
import {
  type ProjectListFilter,
  type ProjectPage,
  type ProjectRepository,
} from '../project/project-repository';
import { type EmbeddingProvider } from '../search/embedding';
import { SEARCH_EXCERPT_LENGTH, type SearchDocument } from '../search/search-document';
import {
  MIN_SEMANTIC_SIMILARITY,
  type SaveEmbeddingInput,
  type SearchDocumentRepository,
  type SearchFilter,
  type SearchResultPage,
} from '../search/search-repository';
import { type EntityVersion } from '../version/entity-version';
import {
  type EntityVersionRepository,
  type VersionListFilter,
  type VersionPage,
} from '../version/entity-version-repository';
import { ConflictError, NotFoundError } from '../shared/errors';

/** Newest first, with the id as a stable tiebreaker. */
function byNewest<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
}

function contains(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle);
}

/**
 * In-memory `ProjectRepository` for tests.
 *
 * Stored records are cloned on the way in and out so a test cannot mutate the
 * repository's state by holding on to a returned object.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly rows = new Map<string, Project>();

  constructor(seed: readonly Project[] = []) {
    for (const project of seed) this.rows.set(project.id, { ...project });
  }

  async insert(project: Project): Promise<Project> {
    this.rows.set(project.id, { ...project });
    return { ...project };
  }

  async findById(projectId: string): Promise<Project | null> {
    const project = this.rows.get(projectId);
    return project ? { ...project } : null;
  }

  async list(filter: ProjectListFilter): Promise<ProjectPage> {
    const search = filter.search?.trim().toLowerCase();

    const matches = [...this.rows.values()]
      .filter((project) => !filter.statuses || filter.statuses.includes(project.status))
      .filter(
        (project) =>
          !search ||
          project.name.toLowerCase().includes(search) ||
          contains(project.description, search),
      )
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((project) => ({ ...project })),
      total: matches.length,
    };
  }

  async save(project: Project): Promise<Project> {
    if (!this.rows.has(project.id)) throw new NotFoundError('Project', project.id);
    this.rows.set(project.id, { ...project });
    return { ...project };
  }
}

/** In-memory `EntityRepository` for tests. Mirrors the Postgres adapter's filtering. */
export class InMemoryEntityRepository implements EntityRepository {
  private readonly rows = new Map<string, Entity>();

  constructor(seed: readonly Entity[] = []) {
    for (const entity of seed) this.rows.set(entity.id, structuredClone(entity));
  }

  async insert(entity: Entity): Promise<Entity> {
    this.rows.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async findById(projectId: string, entityId: string): Promise<Entity | null> {
    const entity = this.rows.get(entityId);
    // A mismatched project reads as missing, never as another project's row.
    if (!entity || entity.projectId !== projectId) return null;
    return structuredClone(entity);
  }

  async listByProject(projectId: string, filter: EntityListFilter): Promise<EntityPage> {
    const search = filter.search?.trim().toLowerCase();
    const tags = filter.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

    const matches = [...this.rows.values()]
      .filter((entity) => entity.projectId === projectId)
      .filter((entity) => {
        if (filter.statuses) return filter.statuses.includes(entity.status);
        return filter.includeArchived === true || entity.status !== 'archived';
      })
      .filter((entity) => !filter.types || filter.types.includes(entity.type))
      .filter(
        (entity) => !tags?.length || entity.tags.some((tag) => tags.includes(tag.toLowerCase())),
      )
      .filter(
        (entity) =>
          !search ||
          entity.name.toLowerCase().includes(search) ||
          contains(entity.description, search),
      )
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((entity) => structuredClone(entity)),
      total: matches.length,
    };
  }

  async save(entity: Entity): Promise<Entity> {
    const existing = this.rows.get(entity.id);
    if (!existing || existing.projectId !== entity.projectId) {
      throw new NotFoundError('Entity', entity.id);
    }
    this.rows.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }
}

/** In-memory `EntityRelationshipRepository` for tests. */
export class InMemoryEntityRelationshipRepository implements EntityRelationshipRepository {
  private readonly rows = new Map<string, EntityRelationship>();

  constructor(seed: readonly EntityRelationship[] = []) {
    for (const relationship of seed) this.rows.set(relationship.id, structuredClone(relationship));
  }

  async insert(relationship: EntityRelationship): Promise<EntityRelationship> {
    this.rows.set(relationship.id, structuredClone(relationship));
    return structuredClone(relationship);
  }

  async findById(projectId: string, relationshipId: string): Promise<EntityRelationship | null> {
    const relationship = this.rows.get(relationshipId);
    if (!relationship || relationship.projectId !== projectId) return null;
    return structuredClone(relationship);
  }

  async listForEntity(
    projectId: string,
    entityId: string,
    filter: RelationshipListFilter,
  ): Promise<RelationshipPage> {
    const direction = filter.direction ?? 'both';

    const matches = [...this.rows.values()]
      .filter((edge) => edge.projectId === projectId)
      .filter((edge) => {
        if (direction === 'outgoing') return edge.sourceEntityId === entityId;
        if (direction === 'incoming') return edge.targetEntityId === entityId;
        return edge.sourceEntityId === entityId || edge.targetEntityId === entityId;
      })
      .filter((edge) => !filter.relations || filter.relations.includes(edge.relation))
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((edge) => structuredClone(edge)),
      total: matches.length,
    };
  }

  async findDuplicate(
    projectId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relation: RelationType,
  ): Promise<EntityRelationship | null> {
    const match = [...this.rows.values()].find(
      (edge) =>
        edge.projectId === projectId &&
        edge.sourceEntityId === sourceEntityId &&
        edge.targetEntityId === targetEntityId &&
        edge.relation === relation,
    );
    return match ? structuredClone(match) : null;
  }

  async delete(projectId: string, relationshipId: string): Promise<void> {
    const relationship = this.rows.get(relationshipId);
    if (!relationship || relationship.projectId !== projectId) {
      throw new NotFoundError('Relationship', relationshipId);
    }
    this.rows.delete(relationshipId);
  }
}

/** In-memory `EntityVersionRepository` for tests. Insert-only, like the real one. */
export class InMemoryEntityVersionRepository implements EntityVersionRepository {
  private readonly rows = new Map<string, EntityVersion>();

  constructor(seed: readonly EntityVersion[] = []) {
    for (const version of seed) this.rows.set(version.id, structuredClone(version));
  }

  async insert(version: EntityVersion): Promise<EntityVersion> {
    this.rows.set(version.id, structuredClone(version));
    return structuredClone(version);
  }

  async findById(projectId: string, versionId: string): Promise<EntityVersion | null> {
    const version = this.rows.get(versionId);
    if (!version || version.projectId !== projectId) return null;
    return structuredClone(version);
  }

  async listForEntity(
    projectId: string,
    entityId: string,
    filter: VersionListFilter,
  ): Promise<VersionPage> {
    const matches = this.forEntity(projectId, entityId)
      .filter((version) => !filter.branchName || version.branchName === filter.branchName)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((version) => structuredClone(version)),
      total: matches.length,
    };
  }

  async latestVersionNumber(projectId: string, entityId: string): Promise<number> {
    return this.forEntity(projectId, entityId).reduce(
      (highest, version) => Math.max(highest, version.versionNumber),
      0,
    );
  }

  async findBranchTip(
    projectId: string,
    entityId: string,
    branchName: string,
  ): Promise<EntityVersion | null> {
    const tip = this.forEntity(projectId, entityId)
      .filter((version) => version.branchName === branchName)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];

    return tip ? structuredClone(tip) : null;
  }

  async listBranches(projectId: string, entityId: string): Promise<string[]> {
    return [
      ...new Set(this.forEntity(projectId, entityId).map((version) => version.branchName)),
    ].sort();
  }

  private forEntity(projectId: string, entityId: string): EntityVersion[] {
    return [...this.rows.values()].filter(
      (version) => version.projectId === projectId && version.entityId === entityId,
    );
  }
}

/** In-memory `AssetRepository` for tests. Mirrors the Postgres adapter's filtering. */
export class InMemoryAssetRepository implements AssetRepository {
  private readonly rows = new Map<string, Asset>();

  constructor(seed: readonly Asset[] = []) {
    for (const asset of seed) this.rows.set(asset.id, { ...asset });
  }

  async insert(asset: Asset): Promise<Asset> {
    this.rows.set(asset.id, { ...asset });
    return { ...asset };
  }

  async findById(projectId: string, assetId: string): Promise<Asset | null> {
    const asset = this.rows.get(assetId);
    // A mismatched project reads as missing, never as another project's row.
    if (!asset || asset.projectId !== projectId) return null;
    return { ...asset };
  }

  async listByProject(projectId: string, filter: AssetListFilter): Promise<AssetPage> {
    const search = filter.search?.trim().toLowerCase();

    const matches = [...this.rows.values()]
      .filter((asset) => asset.projectId === projectId)
      .filter((asset) => {
        if (filter.statuses) return filter.statuses.includes(asset.status);
        return filter.includeArchived === true || asset.status !== 'archived';
      })
      .filter((asset) => !filter.kinds || filter.kinds.includes(asset.kind))
      .filter((asset) => !filter.variants || filter.variants.includes(asset.variant))
      .filter((asset) => !filter.sourceAssetId || asset.sourceAssetId === filter.sourceAssetId)
      .filter((asset) => !search || asset.filename.toLowerCase().includes(search))
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((asset) => ({ ...asset })),
      total: matches.length,
    };
  }

  async save(asset: Asset): Promise<Asset> {
    const existing = this.rows.get(asset.id);
    if (!existing || existing.projectId !== asset.projectId) {
      throw new NotFoundError('Asset', asset.id);
    }
    this.rows.set(asset.id, { ...asset });
    return { ...asset };
  }
}

/** In-memory `ActivityRepository` for tests. Insert-only, like the real one. */
export class InMemoryActivityRepository implements ActivityRepository {
  private readonly rows = new Map<string, Activity>();

  constructor(seed: readonly Activity[] = []) {
    for (const activity of seed) this.rows.set(activity.id, structuredClone(activity));
  }

  async insert(activity: Activity): Promise<Activity> {
    this.rows.set(activity.id, structuredClone(activity));
    return structuredClone(activity);
  }

  async listByProject(projectId: string, filter: ActivityListFilter): Promise<ActivityPage> {
    const matches = [...this.rows.values()]
      .filter((activity) => activity.projectId === projectId)
      .filter((activity) => !filter.types || filter.types.includes(activity.type))
      .filter((activity) => !filter.subjectId || activity.subjectId === filter.subjectId)
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((activity) => structuredClone(activity)),
      total: matches.length,
    };
  }
}

/**
 * In-memory `ObjectStorageProvider` for tests: a `Map` standing in for a disk
 * or a bucket. Fast and dependency-free, so domain-level tests do not need a
 * filesystem; `@level-zero/storage`'s `LocalObjectStorageProvider` is the one
 * that genuinely touches disk.
 */
export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  readonly id = 'in-memory';
  private readonly objects = new Map<string, Buffer>();

  async put(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, Buffer.from(input.body));
  }

  async get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new NotFoundError('Object', key);
    return Buffer.from(object);
  }

  async getUrl(key: string, options?: GetUrlOptions): Promise<string> {
    if (!this.objects.has(key)) throw new NotFoundError('Object', key);
    const suffix = options?.expiresInSeconds ? `?expiresIn=${options.expiresInSeconds}` : '';
    return `in-memory://${key}${suffix}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** In-memory `GenerationRepository` for tests. Mirrors the Postgres adapter's filtering. */
export class InMemoryGenerationRepository implements GenerationRepository {
  private readonly rows = new Map<string, Generation>();

  constructor(seed: readonly Generation[] = []) {
    for (const generation of seed) this.rows.set(generation.id, structuredClone(generation));
  }

  async insert(generation: Generation): Promise<Generation> {
    this.rows.set(generation.id, structuredClone(generation));
    return structuredClone(generation);
  }

  async findById(projectId: string, generationId: string): Promise<Generation | null> {
    const generation = this.rows.get(generationId);
    // A mismatched project reads as missing, never as another project's row.
    if (!generation || generation.projectId !== projectId) return null;
    return structuredClone(generation);
  }

  async listByProject(projectId: string, filter: GenerationListFilter): Promise<GenerationPage> {
    const matches = [...this.rows.values()]
      .filter((generation) => generation.projectId === projectId)
      .filter((generation) => !filter.statuses || filter.statuses.includes(generation.status))
      .filter((generation) => !filter.capability || generation.capability === filter.capability)
      .filter(
        (generation) =>
          !filter.parentGenerationId || generation.parentGenerationId === filter.parentGenerationId,
      )
      .filter(
        (generation) =>
          !filter.outputAssetId || generation.outputAssetIds.includes(filter.outputAssetId),
      )
      .filter(
        (generation) =>
          !filter.entityId ||
          generation.inputEntityIds.includes(filter.entityId) ||
          generation.contextEntityIds.includes(filter.entityId),
      )
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((generation) => structuredClone(generation)),
      total: matches.length,
    };
  }

  async save(generation: Generation): Promise<Generation> {
    const existing = this.rows.get(generation.id);
    if (!existing || existing.projectId !== generation.projectId) {
      throw new NotFoundError('Generation', generation.id);
    }
    this.rows.set(generation.id, structuredClone(generation));
    return structuredClone(generation);
  }
}

/**
 * In-memory `PrototypeVersionRepository` for tests. Mirrors the Postgres
 * adapter: inserts, annotation-only saves, and no delete.
 */
export class InMemoryPrototypeVersionRepository implements PrototypeVersionRepository {
  private readonly rows = new Map<string, PrototypeVersion>();

  constructor(seed: readonly PrototypeVersion[] = []) {
    for (const version of seed) this.rows.set(version.id, structuredClone(version));
  }

  async insert(version: PrototypeVersion): Promise<PrototypeVersion> {
    this.rows.set(version.id, structuredClone(version));
    return structuredClone(version);
  }

  async findById(projectId: string, prototypeVersionId: string): Promise<PrototypeVersion | null> {
    const version = this.rows.get(prototypeVersionId);
    // A mismatched project reads as missing, never as another project's row.
    if (!version || version.projectId !== projectId) return null;
    return structuredClone(version);
  }

  async listForPrototype(
    projectId: string,
    prototypeId: string,
    filter: PrototypeVersionListFilter,
  ): Promise<PrototypeVersionPage> {
    const matches = this.forPrototype(projectId, prototypeId).sort(
      (a, b) => b.versionNumber - a.versionNumber,
    );

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((version) => structuredClone(version)),
      total: matches.length,
    };
  }

  async latestVersionNumber(projectId: string, prototypeId: string): Promise<number> {
    return this.forPrototype(projectId, prototypeId).reduce(
      (highest, version) => Math.max(highest, version.versionNumber),
      0,
    );
  }

  async save(version: PrototypeVersion): Promise<PrototypeVersion> {
    const existing = this.rows.get(version.id);
    if (!existing || existing.projectId !== version.projectId) {
      throw new NotFoundError('Prototype version', version.id);
    }
    this.rows.set(version.id, structuredClone(version));
    return structuredClone(version);
  }

  private forPrototype(projectId: string, prototypeId: string): PrototypeVersion[] {
    return [...this.rows.values()].filter(
      (version) => version.projectId === projectId && version.prototypeId === prototypeId,
    );
  }
}

/**
 * In-memory `MoodboardRepository` for tests.
 *
 * Mirrors what the Postgres schema enforces on delete: removing a node clears
 * the group from anything inside it and drops the connectors touching it, and
 * nothing here ever reads or writes an asset or entity.
 *
 * Promoting a connector writes an edge as well, so this repository is handed
 * the relationship store the service under test was given — the Postgres pair
 * share one database, and here they share one map.
 */
export class InMemoryMoodboardRepository implements MoodboardRepository {
  private readonly nodes = new Map<string, MoodboardNode>();
  private readonly connectors = new Map<string, MoodboardConnector>();

  constructor(
    private readonly relationships: EntityRelationshipRepository,
    seedNodes: readonly MoodboardNode[] = [],
    seedConnectors: readonly MoodboardConnector[] = [],
  ) {
    for (const node of seedNodes) this.nodes.set(node.id, structuredClone(node));
    for (const connector of seedConnectors) {
      this.connectors.set(connector.id, structuredClone(connector));
    }
  }

  async listNodes(projectId: string, boardId: string): Promise<MoodboardNode[]> {
    return [...this.nodes.values()]
      .filter((node) => node.projectId === projectId && node.boardId === boardId)
      .sort((a, b) => a.zOrder - b.zOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((node) => structuredClone(node));
  }

  async findNode(projectId: string, nodeId: string): Promise<MoodboardNode | null> {
    const node = this.nodes.get(nodeId);
    if (!node || node.projectId !== projectId) return null;
    return structuredClone(node);
  }

  async findNodes(projectId: string, nodeIds: readonly string[]): Promise<MoodboardNode[]> {
    const ids = new Set(nodeIds);
    return [...this.nodes.values()]
      .filter((node) => ids.has(node.id) && node.projectId === projectId)
      .map((node) => structuredClone(node));
  }

  async insertNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]> {
    for (const node of nodes) this.nodes.set(node.id, structuredClone(node));
    return nodes.map((node) => structuredClone(node));
  }

  async saveNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]> {
    for (const node of nodes) {
      const existing = this.nodes.get(node.id);
      if (!existing || existing.projectId !== node.projectId) {
        throw new NotFoundError('Moodboard node', node.id);
      }
      this.nodes.set(node.id, structuredClone(node));
    }
    return nodes.map((node) => structuredClone(node));
  }

  async deleteNode(projectId: string, nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node || node.projectId !== projectId) return;

    this.nodes.delete(nodeId);
    for (const other of this.nodes.values()) {
      if (other.groupId === nodeId) other.groupId = null;
    }
    for (const connector of [...this.connectors.values()]) {
      if (connector.fromNodeId === nodeId || connector.toNodeId === nodeId) {
        this.connectors.delete(connector.id);
      }
    }
  }

  async listConnectors(projectId: string, boardId: string): Promise<MoodboardConnector[]> {
    return [...this.connectors.values()]
      .filter((connector) => connector.projectId === projectId && connector.boardId === boardId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((connector) => structuredClone(connector));
  }

  async findConnector(projectId: string, connectorId: string): Promise<MoodboardConnector | null> {
    const connector = this.connectors.get(connectorId);
    if (!connector || connector.projectId !== projectId) return null;
    return structuredClone(connector);
  }

  async insertConnector(connector: MoodboardConnector): Promise<MoodboardConnector> {
    this.connectors.set(connector.id, structuredClone(connector));
    return structuredClone(connector);
  }

  async saveConnector(connector: MoodboardConnector): Promise<MoodboardConnector> {
    const existing = this.connectors.get(connector.id);
    if (!existing || existing.projectId !== connector.projectId) {
      throw new NotFoundError('Moodboard connector', connector.id);
    }
    this.connectors.set(connector.id, structuredClone(connector));
    return structuredClone(connector);
  }

  /** Single-threaded, so the transaction the adapter needs is two writes. */
  async promoteConnector(
    connector: MoodboardConnector,
    relationship: EntityRelationship,
  ): Promise<MoodboardConnector> {
    const existing = this.connectors.get(connector.id);
    if (!existing || existing.projectId !== connector.projectId) {
      throw new NotFoundError('Moodboard connector', connector.id);
    }
    if (existing.relationshipId) {
      throw new ConflictError('That connector has already been promoted', {
        connectorId: connector.id,
        relationshipId: existing.relationshipId,
      });
    }

    await this.relationships.insert(relationship);
    this.connectors.set(connector.id, structuredClone(connector));
    return structuredClone(connector);
  }

  async deleteConnector(projectId: string, connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector || connector.projectId !== projectId) return;
    this.connectors.delete(connectorId);
  }
}

/** In-memory `JobRepository` for tests. Mirrors the Postgres adapter's filtering. */
export class InMemoryJobRepository implements JobRepository {
  private readonly rows = new Map<string, Job>();

  constructor(seed: readonly Job[] = []) {
    for (const job of seed) this.rows.set(job.id, structuredClone(job));
  }

  async insert(job: Job): Promise<Job> {
    this.rows.set(job.id, structuredClone(job));
    return structuredClone(job);
  }

  async findById(projectId: string, jobId: string): Promise<Job | null> {
    const job = this.rows.get(jobId);
    // A mismatched project reads as missing, never as another project's row.
    if (!job || job.projectId !== projectId) return null;
    return structuredClone(job);
  }

  async listByProject(projectId: string, filter: JobListFilter): Promise<JobPage> {
    const matches = [...this.rows.values()]
      .filter((job) => job.projectId === projectId)
      .filter((job) => !filter.statuses || filter.statuses.includes(job.status))
      .filter((job) => !filter.kind || job.kind === filter.kind)
      .filter((job) => !filter.targetId || job.targetId === filter.targetId)
      .sort(byNewest);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? matches.length;

    return {
      items: matches.slice(offset, offset + limit).map((job) => structuredClone(job)),
      total: matches.length,
    };
  }

  async save(job: Job): Promise<Job> {
    const existing = this.rows.get(job.id);
    if (!existing || existing.projectId !== job.projectId) {
      throw new NotFoundError('Job', job.id);
    }
    this.rows.set(job.id, structuredClone(job));
    return structuredClone(job);
  }
}

/**
 * In-memory `JobQueue` for tests: records what was handed to a worker so a test
 * can assert that work was queued without running Redis.
 */
export class InMemoryJobQueue implements JobQueue {
  readonly enqueued: Job[] = [];
  readonly removed: Job[] = [];

  async enqueue(job: Job): Promise<void> {
    this.enqueued.push(structuredClone(job));
  }

  async remove(job: Job): Promise<void> {
    this.removed.push(structuredClone(job));
  }
}

/** In-memory `JobEvents` for tests: delivers to subscribers in the same process. */
export class InMemoryJobEvents implements JobEvents {
  readonly published: Job[] = [];
  private readonly listeners = new Map<string, Set<(job: Job) => void>>();

  async publish(job: Job): Promise<void> {
    this.published.push(structuredClone(job));
    for (const listener of this.listeners.get(job.projectId) ?? []) {
      listener(structuredClone(job));
    }
  }

  async subscribe(projectId: string, listener: (job: Job) => void): Promise<JobSubscription> {
    const listeners = this.listeners.get(projectId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);

    return {
      close: async () => {
        listeners.delete(listener);
      },
    };
  }
}

/**
 * In-memory `SearchDocumentRepository` for tests.
 *
 * Filtering, project scoping and cosine ranking mirror the Postgres adapter.
 * Keyword matching does not: Postgres stems and weights its `tsvector`, and
 * this counts whole-word hits instead, which is enough to prove a service asked
 * for the right thing. The ranking that ships is proven against real Postgres
 * in `packages/database`.
 */
export class InMemorySearchDocumentRepository implements SearchDocumentRepository {
  private readonly rows = new Map<string, SearchDocument>();

  async upsert(document: SearchDocument): Promise<SearchDocument> {
    const key = `${document.sourceType}:${document.sourceId}`;
    const existing = this.rows.get(key);

    // The vector survives a re-index; whether it is stale is what the hashes say.
    const stored: SearchDocument = {
      ...structuredClone(document),
      id: existing?.id ?? document.id,
      embedding: existing?.embedding ?? null,
      embeddingModel: existing?.embeddingModel ?? null,
      embeddedHash: existing?.embeddedHash ?? null,
    };

    this.rows.set(key, stored);
    return structuredClone(stored);
  }

  async searchText(projectId: string, filter: SearchFilter): Promise<SearchResultPage> {
    const terms = tokenize(filter.text ?? '');

    const scored = this.matching(projectId, filter).flatMap((document) => {
      if (terms.length === 0) return [{ document, score: 0 }];

      const title = tokenize(document.title);
      const body = tokenize(document.body);
      const score = terms.reduce(
        (total, term) => total + (title.includes(term) ? 2 : 0) + (body.includes(term) ? 1 : 0),
        0,
      );
      return score > 0 ? [{ document, score }] : [];
    });

    return pageOfHits(scored, filter);
  }

  async searchSimilar(
    projectId: string,
    embedding: readonly number[],
    model: string,
    filter: SearchFilter,
  ): Promise<SearchResultPage> {
    const scored = this.matching(projectId, filter).flatMap((document) => {
      if (document.embeddingModel !== model) return [];
      if (document.embedding?.length !== embedding.length) return [];

      const vector = document.embedding;
      const score = vector.reduce(
        (total, value, index) => total + value * (embedding[index] ?? 0),
        0,
      );
      // Ranking alone would return the whole project; a hit has to be a hit.
      return score >= MIN_SEMANTIC_SIMILARITY ? [{ document, score }] : [];
    });

    return pageOfHits(scored, filter);
  }

  async listStale(projectId: string, limit: number): Promise<SearchDocument[]> {
    return [...this.rows.values()]
      .filter(
        (document) =>
          document.projectId === projectId && document.embeddedHash !== document.contentHash,
      )
      .sort((a, b) => a.indexedAt.getTime() - b.indexedAt.getTime())
      .slice(0, limit)
      .map((document) => structuredClone(document));
  }

  async saveEmbedding(
    projectId: string,
    documentId: string,
    input: SaveEmbeddingInput,
  ): Promise<void> {
    for (const [key, document] of this.rows) {
      if (document.id !== documentId || document.projectId !== projectId) continue;
      // The row may have been re-indexed since the vector was asked for; only
      // the text that was actually embedded gets it.
      if (document.contentHash !== input.contentHash) return;

      this.rows.set(key, {
        ...document,
        embedding: [...input.embedding],
        embeddingModel: input.model,
        embeddedHash: input.contentHash,
      });
      return;
    }
  }

  private matching(projectId: string, filter: SearchFilter): SearchDocument[] {
    const tags = (filter.tags ?? [])
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);

    return [...this.rows.values()].filter((document) => {
      if (document.projectId !== projectId) return false;
      if (filter.sourceTypes?.length && !filter.sourceTypes.includes(document.sourceType)) {
        return false;
      }
      if (
        filter.entityTypes?.length &&
        (document.entityType === null || !filter.entityTypes.includes(document.entityType))
      ) {
        return false;
      }
      if (filter.statuses?.length) {
        if (!filter.statuses.includes(document.status)) return false;
      } else if (filter.includeArchived !== true && document.status === 'archived') {
        return false;
      }
      if (tags.length > 0 && !document.tags.some((tag) => tags.includes(tag.toLowerCase()))) {
        return false;
      }
      if (filter.updatedAfter && document.sourceUpdatedAt < filter.updatedAfter) return false;
      if (filter.updatedBefore && document.sourceUpdatedAt > filter.updatedBefore) return false;
      return true;
    });
  }
}

/**
 * Deterministic `EmbeddingProvider` for tests: one dimension per vocabulary
 * term, so a test states in the vector space itself what "related" means.
 */
export class InMemoryEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly vocabulary: readonly string[],
    readonly model = 'test-embedding',
  ) {}

  get dimensions(): number {
    return this.vocabulary.length;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => {
      const terms = tokenize(text);
      const counts = this.vocabulary.map(
        (term) => terms.filter((candidate) => candidate === term).length,
      );
      const length = Math.hypot(...counts);
      return length === 0 ? counts : counts.map((count) => count / length);
    });
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Ranks, pages and projects hits the way the Postgres adapter does. */
function pageOfHits(
  scored: readonly { document: SearchDocument; score: number }[],
  filter: SearchFilter,
): SearchResultPage {
  const ranked = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      b.document.sourceUpdatedAt.getTime() - a.document.sourceUpdatedAt.getTime(),
  );

  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? ranked.length;

  return {
    items: ranked.slice(offset, offset + limit).map(({ document, score }) => ({
      projectId: document.projectId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      entityType: document.entityType,
      status: document.status,
      tags: [...document.tags],
      title: document.title,
      excerpt: document.body.slice(0, SEARCH_EXCERPT_LENGTH),
      sourceVersionId: document.sourceVersionId,
      updatedAt: document.sourceUpdatedAt,
      score,
    })),
    total: ranked.length,
  };
}
