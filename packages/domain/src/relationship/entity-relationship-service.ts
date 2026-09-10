import { type Entity } from '../entity/entity';
import { type EntityRepository } from '../entity/entity-repository';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import { createEntityRelationship, type EntityRelationship } from './entity-relationship';
import {
  type EntityRelationshipRepository,
  type RelationshipListFilter,
  type RelationshipPage,
} from './entity-relationship-repository';
import { isLineageRelation, type RelationType } from './relation-type';

export interface RelationshipServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface LinkInput {
  sourceEntityId: string;
  targetEntityId: string;
  relation: RelationType;
  metadata?: Record<string, unknown>;
}

/** One edge together with the entity on the far end of it. */
export interface NeighborEdge {
  relationship: EntityRelationship;
  direction: 'outgoing' | 'incoming';
  entity: Entity;
}

/** An entity and everything one hop away from it. */
export interface EntityNeighborhood {
  entity: Entity;
  outgoing: NeighborEdge[];
  incoming: NeighborEdge[];
}

export class EntityRelationshipService {
  constructor(
    private readonly relationships: EntityRelationshipRepository,
    private readonly entities: EntityRepository,
    private readonly deps: RelationshipServiceDeps,
  ) {}

  /**
   * Links two entities.
   *
   * Both endpoints are read through the project first, so an id from another
   * project fails as "not found" before an edge can be written.
   */
  async link(projectId: string, input: LinkInput): Promise<EntityRelationship> {
    return this.relationships.insert(await this.draftLink(projectId, input));
  }

  /**
   * Runs `link`'s checks and returns the edge they passed, unwritten.
   *
   * Split out for `MoodboardService.promoteConnector`, which has to write the
   * edge in the same transaction as the connector pointing at it and so cannot
   * let this service do the insert.
   */
  async draftLink(projectId: string, input: LinkInput): Promise<EntityRelationship> {
    const relationship = createEntityRelationship({ ...input, projectId }, this.deps);

    await this.requireEntity(projectId, relationship.sourceEntityId);
    await this.requireEntity(projectId, relationship.targetEntityId);

    const duplicate = await this.relationships.findDuplicate(
      projectId,
      relationship.sourceEntityId,
      relationship.targetEntityId,
      relationship.relation,
    );
    if (duplicate) {
      throw new ConflictError('That relationship already exists', {
        relationshipId: duplicate.id,
        relation: duplicate.relation,
      });
    }

    return relationship;
  }

  /** Creates several edges at once, used by the lineage workflows. */
  async linkMany(projectId: string, inputs: readonly LinkInput[]): Promise<EntityRelationship[]> {
    const created: EntityRelationship[] = [];
    for (const input of inputs) {
      created.push(await this.link(projectId, input));
    }
    return created;
  }

  async getById(projectId: string, relationshipId: string): Promise<EntityRelationship> {
    const relationship = await this.relationships.findById(projectId, relationshipId);
    if (!relationship) throw new NotFoundError('Relationship', relationshipId);
    return relationship;
  }

  async listForEntity(
    projectId: string,
    entityId: string,
    filter: RelationshipListFilter = {},
  ): Promise<RelationshipPage> {
    await this.requireEntity(projectId, entityId);
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.relationships.listForEntity(projectId, entityId, { ...filter, limit, offset });
  }

  /**
   * The immediate neighbourhood of an entity: every edge one hop away, with the
   * entity on the far end resolved.
   *
   * Archived neighbours are included and carry their status, so lineage stays
   * visible instead of quietly disappearing from the graph.
   */
  async neighborhood(
    projectId: string,
    entityId: string,
    filter: RelationshipListFilter = {},
  ): Promise<EntityNeighborhood> {
    const entity = await this.requireEntity(projectId, entityId);
    const { items } = await this.listForEntity(projectId, entityId, filter);

    const neighborIds = new Set(
      items.map((edge) =>
        edge.sourceEntityId === entityId ? edge.targetEntityId : edge.sourceEntityId,
      ),
    );
    const neighbors = new Map<string, Entity>();
    for (const id of neighborIds) {
      const neighbor = await this.entities.findById(projectId, id);
      if (neighbor) neighbors.set(id, neighbor);
    }

    const outgoing: NeighborEdge[] = [];
    const incoming: NeighborEdge[] = [];

    for (const relationship of items) {
      const isOutgoing = relationship.sourceEntityId === entityId;
      const neighbor = neighbors.get(
        isOutgoing ? relationship.targetEntityId : relationship.sourceEntityId,
      );
      if (!neighbor) continue;

      const edge: NeighborEdge = {
        relationship,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        entity: neighbor,
      };
      (isOutgoing ? outgoing : incoming).push(edge);
    }

    return { entity, outgoing, incoming };
  }

  /**
   * Removes a structural link.
   *
   * Lineage relations are refused: they record how something came to exist, and
   * that history is not the user's to rewrite. Archiving an endpoint entity is
   * the supported way to retire a connection.
   */
  async unlink(projectId: string, relationshipId: string): Promise<void> {
    const relationship = await this.getById(projectId, relationshipId);

    if (isLineageRelation(relationship.relation)) {
      throw new ConflictError(`"${relationship.relation}" records lineage and cannot be removed`, {
        relationshipId,
        relation: relationship.relation,
      });
    }

    await this.relationships.delete(projectId, relationshipId);
  }

  private async requireEntity(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.entities.findById(projectId, entityId);
    if (!entity) throw new NotFoundError('Entity', entityId);
    return entity;
  }
}
