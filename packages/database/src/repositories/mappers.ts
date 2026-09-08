import {
  type Entity,
  type EntityRelationship,
  type EntityVersion,
  type Project,
} from '@level-zero/domain';

import { type EntityRow, type NewEntityRow } from '../schema/entities';
import {
  type EntityRelationshipRow,
  type NewEntityRelationshipRow,
} from '../schema/entity-relationships';
import { type EntityVersionRow, type NewEntityVersionRow } from '../schema/entity-versions';
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

export function toEntityVersion(row: EntityVersionRow): EntityVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    entityId: row.entityId,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    branchName: row.branchName,
    snapshot: row.snapshot,
    reason: row.reason,
    metadata: row.metadata,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function toEntityVersionRow(version: EntityVersion): NewEntityVersionRow {
  return {
    id: version.id,
    projectId: version.projectId,
    entityId: version.entityId,
    versionNumber: version.versionNumber,
    parentVersionId: version.parentVersionId,
    branchName: version.branchName,
    snapshot: version.snapshot,
    reason: version.reason,
    metadata: version.metadata,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  };
}

/**
 * Escapes the wildcards Postgres `LIKE` understands so a user searching for
 * "100%" does not accidentally match everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
