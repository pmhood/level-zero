import { type ActivityService } from '../activity/activity-service';
import { assetReferenceData } from '../asset/asset-reference';
import { ConflictError, NotFoundError } from '../shared/errors';
import { normalizePaging } from '../shared/paging';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { type ProjectRepository } from '../project/project-repository';
import {
  applyEntityUpdate,
  archiveEntity,
  createEntity,
  restoreEntity,
  type CreateEntityInput,
  type Entity,
  type UpdateEntityInput,
} from './entity';
import { type SearchIndexer } from '../search/search-indexer';
import { type EntityListFilter, type EntityPage, type EntityRepository } from './entity-repository';
import { type EntityType } from './entity-type';

export interface EntityServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Application service for canonical entities.
 *
 * Every Workbench tool — Idea Lab, Character Studio, the GDD editor — reads and
 * writes entities through this one service. Features must not add their own
 * stores that duplicate entity identity.
 *
 * Because it is the one funnel, it is also where the search index is told an
 * entity changed. The indexer is optional: a caller that does not want one —
 * most tests — leaves it out and nothing else behaves differently.
 */
export class EntityService {
  constructor(
    private readonly entities: EntityRepository,
    private readonly projects: ProjectRepository,
    private readonly activity: ActivityService,
    private readonly deps: EntityServiceDeps,
    private readonly search?: SearchIndexer,
  ) {}

  async create(projectId: string, input: Omit<CreateEntityInput, 'projectId'>): Promise<Entity> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot add entities to an archived project', { projectId });
    }

    const entity = await this.entities.insert(createEntity({ ...input, projectId }, this.deps));

    await this.activity.record({
      projectId,
      type: 'entity_created',
      summary: `${entity.name} created`,
      subjectType: 'entity',
      subjectId: entity.id,
      metadata: { entityType: entity.type, name: entity.name },
    });

    return this.indexed(entity);
  }

  /**
   * Reads one entity within a project.
   *
   * An id that belongs to a different project reports `NotFoundError`, the same
   * as an id that does not exist: a caller must not be able to probe for the
   * existence of another project's entities.
   */
  async getById(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.entities.findById(projectId, entityId);
    if (!entity) throw new NotFoundError('Entity', entityId);
    return entity;
  }

  async listByProject(projectId: string, filter: EntityListFilter = {}): Promise<EntityPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.entities.listByProject(projectId, { ...filter, limit, offset });
  }

  /** Convenience wrapper over `listByProject` for a single type. */
  async listByType(
    projectId: string,
    type: EntityType,
    filter: Omit<EntityListFilter, 'types'> = {},
  ): Promise<EntityPage> {
    return this.listByProject(projectId, { ...filter, types: [type] });
  }

  async update(projectId: string, entityId: string, patch: UpdateEntityInput): Promise<Entity> {
    const entity = await this.getById(projectId, entityId);
    return this.indexed(await this.entities.save(applyEntityUpdate(entity, patch, this.deps)));
  }

  /**
   * The `asset_reference` entity standing for `assetId` in `projectId`,
   * creating one — named `name` — only if the project has none yet.
   *
   * One entity per asset is the part that matters: reusing it is what lets
   * the same image hang off a character, a location and a board without
   * three copies of it, and what makes the lineage on it the lineage of the
   * file rather than of one link. The lookup and the create race are both
   * resolved by `EntityRepository.findOrCreateAssetReference` in one atomic
   * call, not by scanning a page of candidates here.
   *
   * Archived references are found too, for the same reason: a re-linked
   * asset recovers the entity that already carries its history.
   */
  async findOrCreateAssetReference(
    projectId: string,
    assetId: string,
    input: { name: string },
  ): Promise<Entity> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot add entities to an archived project', { projectId });
    }

    const candidate = createEntity(
      {
        projectId,
        type: 'asset_reference',
        name: input.name,
        status: 'active',
        data: assetReferenceData(assetId),
      },
      this.deps,
    );

    const { entity, created } = await this.entities.findOrCreateAssetReference(candidate, assetId);
    if (!created) return entity;

    await this.activity.record({
      projectId,
      type: 'entity_created',
      summary: `${entity.name} created`,
      subjectType: 'entity',
      subjectId: entity.id,
      metadata: { entityType: entity.type, name: entity.name },
    });

    return this.indexed(entity);
  }

  async archive(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.getById(projectId, entityId);
    const archived = await this.entities.save(archiveEntity(entity, this.deps));

    await this.activity.record({
      projectId,
      type: 'entity_archived',
      summary: `${archived.name} archived`,
      subjectType: 'entity',
      subjectId: archived.id,
      metadata: { entityType: archived.type, name: archived.name },
    });

    return this.indexed(archived);
  }

  async restore(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.getById(projectId, entityId);
    const restored = await this.entities.save(restoreEntity(entity, this.deps));

    await this.activity.record({
      projectId,
      type: 'entity_restored',
      summary: `${restored.name} restored`,
      subjectType: 'entity',
      subjectId: restored.id,
      metadata: { entityType: restored.type, name: restored.name },
    });

    return this.indexed(restored);
  }

  /**
   * Hands the saved entity to the search index, when one is wired up.
   *
   * Called after the activity record, and last of the three: the index is
   * derived, so it must never come between the write and the history of it.
   */
  private async indexed(entity: Entity): Promise<Entity> {
    await this.search?.entityChanged(entity);
    return entity;
  }
}
