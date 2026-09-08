import {
  NotFoundError,
  type EntityRelationship,
  type EntityRelationshipRepository,
  type RelationType,
  type RelationshipListFilter,
  type RelationshipPage,
} from '@level-zero/domain';
import { and, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { entityRelationships } from '../schema/entity-relationships';
import { toEntityRelationship, toEntityRelationshipRow } from './mappers';

/** Postgres adapter for the domain's `EntityRelationshipRepository` port. */
export class DrizzleEntityRelationshipRepository implements EntityRelationshipRepository {
  constructor(private readonly db: Database) {}

  async insert(relationship: EntityRelationship): Promise<EntityRelationship> {
    const [row] = await this.db
      .insert(entityRelationships)
      .values(toEntityRelationshipRow(relationship))
      .returning();

    if (!row) throw new Error('Insert returned no relationship row');
    return toEntityRelationship(row);
  }

  async findById(projectId: string, relationshipId: string): Promise<EntityRelationship | null> {
    const [row] = await this.db
      .select()
      .from(entityRelationships)
      .where(
        and(
          eq(entityRelationships.id, relationshipId),
          eq(entityRelationships.projectId, projectId),
        ),
      )
      .limit(1);

    return row ? toEntityRelationship(row) : null;
  }

  async listForEntity(
    projectId: string,
    entityId: string,
    filter: RelationshipListFilter,
  ): Promise<RelationshipPage> {
    const where = buildWhere(projectId, entityId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(entityRelationships)
        .where(where)
        .orderBy(desc(entityRelationships.createdAt), desc(entityRelationships.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(entityRelationships).where(where),
    ]);

    return { items: rows.map(toEntityRelationship), total: totals?.value ?? 0 };
  }

  async findDuplicate(
    projectId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relation: RelationType,
  ): Promise<EntityRelationship | null> {
    const [row] = await this.db
      .select()
      .from(entityRelationships)
      .where(
        and(
          eq(entityRelationships.projectId, projectId),
          eq(entityRelationships.sourceEntityId, sourceEntityId),
          eq(entityRelationships.targetEntityId, targetEntityId),
          eq(entityRelationships.relation, relation),
        ),
      )
      .limit(1);

    return row ? toEntityRelationship(row) : null;
  }

  async delete(projectId: string, relationshipId: string): Promise<void> {
    const deleted = await this.db
      .delete(entityRelationships)
      .where(
        and(
          eq(entityRelationships.id, relationshipId),
          eq(entityRelationships.projectId, projectId),
        ),
      )
      .returning({ id: entityRelationships.id });

    if (deleted.length === 0) throw new NotFoundError('Relationship', relationshipId);
  }
}

function buildWhere(projectId: string, entityId: string, filter: RelationshipListFilter): SQL {
  const conditions: SQL[] = [eq(entityRelationships.projectId, projectId)];

  const direction = filter.direction ?? 'both';
  if (direction === 'outgoing') {
    conditions.push(eq(entityRelationships.sourceEntityId, entityId));
  } else if (direction === 'incoming') {
    conditions.push(eq(entityRelationships.targetEntityId, entityId));
  } else {
    const touches = or(
      eq(entityRelationships.sourceEntityId, entityId),
      eq(entityRelationships.targetEntityId, entityId),
    );
    if (touches) conditions.push(touches);
  }

  if (filter.relations?.length) {
    conditions.push(inArray(entityRelationships.relation, [...filter.relations]));
  }

  return and(...conditions) as SQL;
}
