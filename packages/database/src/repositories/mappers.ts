import { type Entity, type Project } from '@level-zero/domain';

import { type EntityRow, type NewEntityRow } from '../schema/entities';
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

/**
 * Escapes the wildcards Postgres `LIKE` understands so a user searching for
 * "100%" does not accidentally match everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
