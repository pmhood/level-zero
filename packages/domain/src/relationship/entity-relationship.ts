import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { requireJsonObject, requireOneOf, requireText } from '../shared/validation';
import { RELATION_TYPES, type RelationType } from './relation-type';

/**
 * A directional edge between two entities in the same project.
 *
 * Relationships are first-class rows rather than foreign keys on entities, so a
 * character can link to a faction, a location, a mechanic and an asset
 * reference without any of those objects being copied or owned.
 */
export interface EntityRelationship {
  id: string;
  projectId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relation: RelationType;
  /** Free-form context for the edge (why it exists, ordering, notes). */
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEntityRelationshipInput {
  projectId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relation: RelationType;
  metadata?: Record<string, unknown>;
}

export interface RelationshipFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createEntityRelationship(
  input: CreateEntityRelationshipInput,
  deps: RelationshipFactoryDeps,
): EntityRelationship {
  const sourceEntityId = requireText('sourceEntityId', input.sourceEntityId, 200);
  const targetEntityId = requireText('targetEntityId', input.targetEntityId, 200);

  if (sourceEntityId === targetEntityId) {
    throw new ValidationError('An entity cannot be related to itself', { sourceEntityId });
  }

  const now = deps.clock.now();
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    sourceEntityId,
    targetEntityId,
    relation: requireOneOf('relation', input.relation, RELATION_TYPES),
    metadata: requireJsonObject('metadata', input.metadata),
    createdAt: now,
    updatedAt: now,
  };
}
