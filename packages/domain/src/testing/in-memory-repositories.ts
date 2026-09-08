import { type Entity } from '../entity/entity';
import {
  type EntityListFilter,
  type EntityPage,
  type EntityRepository,
} from '../entity/entity-repository';
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
