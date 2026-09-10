import { type Entity, type EntityStatus } from './entity';
import { type EntityType } from './entity-type';

export interface EntityListFilter {
  types?: readonly EntityType[];
  statuses?: readonly EntityStatus[];
  /** Matches entities carrying *any* of these tags (case-insensitive). */
  tags?: readonly string[];
  /** Case-insensitive substring match against name and description. */
  search?: string;
  /** Archived entities are hidden unless this is true or `statuses` asks for them. */
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface EntityPage {
  items: Entity[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

export interface FindOrCreateAssetReferenceResult {
  entity: Entity;
  /** False when `entity` was already there and `entity` passed in was discarded. */
  created: boolean;
}

/**
 * Storage port for entities.
 *
 * Every read is scoped by `projectId`. That is what makes cross-project access
 * structurally impossible rather than a rule each caller has to remember.
 */
export interface EntityRepository {
  insert(entity: Entity): Promise<Entity>;
  findById(projectId: string, entityId: string): Promise<Entity | null>;
  listByProject(projectId: string, filter: EntityListFilter): Promise<EntityPage>;
  save(entity: Entity): Promise<Entity>;

  /**
   * Inserts `entity` — an `asset_reference` for `assetId` — unless the
   * project already has one pointing at that asset (active or archived), in
   * which case the existing entity is returned instead of a duplicate.
   *
   * Atomic under concurrent callers: backed by a database constraint rather
   * than a check-then-insert, so two requests racing to attach the same
   * asset can never both win the insert.
   */
  findOrCreateAssetReference(
    entity: Entity,
    assetId: string,
  ): Promise<FindOrCreateAssetReferenceResult>;
}
