import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import {
  normalizeTags,
  optionalText,
  requireJsonObject,
  requireOneOf,
  requireText,
} from '../shared/validation';
import { ENTITY_TYPES, type EntityType } from './entity-type';

export const ENTITY_STATUSES = ['draft', 'active', 'archived'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const MAX_ENTITY_NAME_LENGTH = 200;
export const MAX_ENTITY_DESCRIPTION_LENGTH = 10_000;

/**
 * The canonical representation of a game concept.
 *
 * Characters, mechanics, locations and ideas are all entities: one identity,
 * one lifecycle, one place to look. Type-specific fields live in `data` so a
 * new kind of metadata does not need a migration.
 */
export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  description: string | null;
  status: EntityStatus;
  tags: string[];
  /** Type-specific structured data, stored as JSON. */
  data: Record<string, unknown>;
  /** Set by the versioning work in issue #4; null until an entity is versioned. */
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CreateEntityInput {
  projectId: string;
  type: EntityType;
  name: string;
  description?: string | null;
  status?: EntityStatus;
  tags?: string[];
  data?: Record<string, unknown>;
}

export interface UpdateEntityInput {
  name?: string;
  description?: string | null;
  status?: Exclude<EntityStatus, 'archived'>;
  tags?: string[];
  data?: Record<string, unknown>;
}

export interface EntityFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createEntity(input: CreateEntityInput, deps: EntityFactoryDeps): Entity {
  const now = deps.clock.now();
  const status = input.status ?? 'draft';

  if (status === 'archived') {
    throw new ValidationError('An entity cannot be created in the archived state', {
      field: 'status',
    });
  }

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    type: requireOneOf('type', input.type, ENTITY_TYPES),
    name: requireText('name', input.name, MAX_ENTITY_NAME_LENGTH),
    description: optionalText('description', input.description, MAX_ENTITY_DESCRIPTION_LENGTH),
    status: requireOneOf('status', status, ENTITY_STATUSES),
    tags: normalizeTags(input.tags),
    data: requireJsonObject('data', input.data),
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

/**
 * Returns a new entity with the patch applied; the input is never mutated.
 *
 * `data` is replaced wholesale rather than deep-merged, so a caller can remove
 * a field. Archiving is a separate operation.
 */
export function applyEntityUpdate(
  entity: Entity,
  patch: UpdateEntityInput,
  deps: { clock: Clock },
): Entity {
  if (entity.status === 'archived') {
    throw new ValidationError('An archived entity must be restored before it can be edited', {
      entityId: entity.id,
    });
  }

  const next: Entity = { ...entity };

  if (patch.name !== undefined) {
    next.name = requireText('name', patch.name, MAX_ENTITY_NAME_LENGTH);
  }
  if (patch.description !== undefined) {
    next.description = optionalText(
      'description',
      patch.description,
      MAX_ENTITY_DESCRIPTION_LENGTH,
    );
  }
  if (patch.status !== undefined) {
    next.status = requireOneOf('status', patch.status, ['draft', 'active'] as const);
  }
  if (patch.tags !== undefined) {
    next.tags = normalizeTags(patch.tags);
  }
  if (patch.data !== undefined) {
    next.data = requireJsonObject('data', patch.data);
  }

  next.updatedAt = deps.clock.now();
  return next;
}

/**
 * Archiving hides an entity from normal listings without deleting it, so
 * relationships and lineage that point at it stay intact.
 */
export function archiveEntity(entity: Entity, deps: { clock: Clock }): Entity {
  if (entity.status === 'archived') {
    throw new ValidationError('Entity is already archived', { entityId: entity.id });
  }

  const now = deps.clock.now();
  return { ...entity, status: 'archived', archivedAt: now, updatedAt: now };
}

export function restoreEntity(entity: Entity, deps: { clock: Clock }): Entity {
  if (entity.status !== 'archived') {
    throw new ValidationError('Entity is not archived', { entityId: entity.id });
  }

  return { ...entity, status: 'draft', archivedAt: null, updatedAt: deps.clock.now() };
}
