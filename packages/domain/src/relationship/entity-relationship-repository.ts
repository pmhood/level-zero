import { type EntityRelationship } from './entity-relationship';
import { type RelationType } from './relation-type';

export type RelationshipDirection = 'outgoing' | 'incoming' | 'both';

export interface RelationshipListFilter {
  /** Which side of the edge the entity must be on. Defaults to `both`. */
  direction?: RelationshipDirection;
  relations?: readonly RelationType[];
  limit?: number;
  offset?: number;
}

export interface RelationshipPage {
  items: EntityRelationship[];
  total: number;
}

/**
 * Storage port for relationship edges.
 *
 * As with entities, every method is scoped by `projectId`, so an edge can never
 * be read or written across projects.
 */
export interface EntityRelationshipRepository {
  insert(relationship: EntityRelationship): Promise<EntityRelationship>;
  findById(projectId: string, relationshipId: string): Promise<EntityRelationship | null>;
  /** Edges touching `entityId`, filtered by direction and relation type. */
  listForEntity(
    projectId: string,
    entityId: string,
    filter: RelationshipListFilter,
  ): Promise<RelationshipPage>;
  findDuplicate(
    projectId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relation: RelationType,
  ): Promise<EntityRelationship | null>;
  delete(projectId: string, relationshipId: string): Promise<void>;
}
