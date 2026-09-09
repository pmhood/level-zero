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
import { type Project } from '../project/project';
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
import { type EntityVersion } from '../version/entity-version';
import {
  type EntityVersionRepository,
  type VersionListFilter,
  type VersionPage,
} from '../version/entity-version-repository';
import { NotFoundError } from '../shared/errors';

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
