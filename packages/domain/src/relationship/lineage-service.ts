import { type Entity, type EntityStatus } from '../entity/entity';
import { type EntityService } from '../entity/entity-service';
import { type EntityType } from '../entity/entity-type';
import { ValidationError } from '../shared/errors';
import { type EntityRelationship } from './entity-relationship';
import { type EntityRelationshipService } from './entity-relationship-service';

export interface PromoteEntityInput {
  /** What the source should become: an idea promoted to a mechanic, say. */
  type: EntityType;
  /** Defaults to the source entity's name. */
  name?: string;
  description?: string | null;
  status?: Exclude<EntityStatus, 'archived'>;
  tags?: string[];
  data?: Record<string, unknown>;
  /** Context recorded on the lineage edge. */
  metadata?: Record<string, unknown>;
}

export interface PromotionResult {
  /** Unchanged. Promotion is additive, never a destructive conversion. */
  source: Entity;
  promoted: Entity;
  relationship: EntityRelationship;
}

/**
 * Workflows that create entities *and* the lineage explaining where they came
 * from, so provenance is never left to the caller to remember.
 */
export class LineageService {
  constructor(
    private readonly entities: EntityService,
    private readonly relationships: EntityRelationshipService,
  ) {}

  /**
   * Promotes an entity into a new one of another type — an idea into a mechanic,
   * a character, a design pillar — recording a `promoted_to` edge.
   *
   * The source is preserved exactly as it was: a promoted idea is still an idea.
   */
  async promote(
    projectId: string,
    sourceEntityId: string,
    input: PromoteEntityInput,
  ): Promise<PromotionResult> {
    const source = await this.entities.getById(projectId, sourceEntityId);

    if (input.type === source.type) {
      throw new ValidationError('Promote an entity to a different type', {
        entityId: sourceEntityId,
        type: source.type,
      });
    }

    const promoted = await this.entities.create(projectId, {
      type: input.type,
      name: input.name ?? source.name,
      description: input.description === undefined ? source.description : input.description,
      ...(input.status ? { status: input.status } : {}),
      tags: input.tags ?? source.tags,
      data: input.data ?? {},
    });

    const relationship = await this.relationships.link(projectId, {
      sourceEntityId: source.id,
      targetEntityId: promoted.id,
      relation: 'promoted_to',
      metadata: { fromType: source.type, toType: promoted.type, ...(input.metadata ?? {}) },
    });

    return { source, promoted, relationship };
  }

  /**
   * Records which entities influenced a generated one, so a generated concept
   * can be traced back to the references and entities behind it.
   *
   * Called by the generation pipeline (issues #6 and #8); the edges it writes
   * are ordinary `generated_from` relationships.
   */
  async recordGeneratedFrom(
    projectId: string,
    generatedEntityId: string,
    sourceEntityIds: readonly string[],
    metadata: Record<string, unknown> = {},
  ): Promise<EntityRelationship[]> {
    const unique = [...new Set(sourceEntityIds)].filter((id) => id !== generatedEntityId);

    return this.relationships.linkMany(
      projectId,
      unique.map((sourceEntityId) => ({
        sourceEntityId: generatedEntityId,
        targetEntityId: sourceEntityId,
        relation: 'generated_from' as const,
        metadata,
      })),
    );
  }
}
