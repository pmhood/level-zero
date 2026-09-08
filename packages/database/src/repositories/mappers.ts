import { type Entity, type EntityRelationship, type Project } from '@level-zero/domain';

import { type EntityRow, type NewEntityRow } from '../schema/entities';
import {
  type EntityRelationshipRow,
  type NewEntityRelationshipRow,
} from '../schema/entity-relationships';
import { type NewProjectRow, type ProjectRow } from '../schema/projects';

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function toProjectRow(project: Project): NewProjectRow {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
  };
}

export function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    description: row.description,
    status: row.status,
    tags: row.tags,
    data: row.data,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function toEntityRow(entity: Entity): NewEntityRow {
  return {
    id: entity.id,
    projectId: entity.projectId,
    type: entity.type,
    name: entity.name,
    description: entity.description,
    status: entity.status,
    tags: entity.tags,
    data: entity.data,
    currentVersionId: entity.currentVersionId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    archivedAt: entity.archivedAt,
  };
}

export function toEntityRelationship(row: EntityRelationshipRow): EntityRelationship {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    relation: row.relation,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toEntityRelationshipRow(
  relationship: EntityRelationship,
): NewEntityRelationshipRow {
  return {
    id: relationship.id,
    projectId: relationship.projectId,
    sourceEntityId: relationship.sourceEntityId,
    targetEntityId: relationship.targetEntityId,
    relation: relationship.relation,
    metadata: relationship.metadata,
    createdAt: relationship.createdAt,
    updatedAt: relationship.updatedAt,
  };
}

/**
 * Escapes the wildcards Postgres `LIKE` understands so a user searching for
 * "100%" does not accidentally match everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
