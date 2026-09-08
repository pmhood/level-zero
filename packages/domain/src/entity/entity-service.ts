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
 */
export class EntityService {
  constructor(
    private readonly entities: EntityRepository,
    private readonly projects: ProjectRepository,
    private readonly deps: EntityServiceDeps,
  ) {}

  async create(projectId: string, input: Omit<CreateEntityInput, 'projectId'>): Promise<Entity> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot add entities to an archived project', { projectId });
    }

    return this.entities.insert(createEntity({ ...input, projectId }, this.deps));
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
    return this.entities.save(applyEntityUpdate(entity, patch, this.deps));
  }

  async archive(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.getById(projectId, entityId);
    return this.entities.save(archiveEntity(entity, this.deps));
  }

  async restore(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.getById(projectId, entityId);
    return this.entities.save(restoreEntity(entity, this.deps));
  }
}
