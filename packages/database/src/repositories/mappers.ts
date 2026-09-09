import {
  type Asset,
  type Entity,
  type EntityRelationship,
  type EntityVersion,
  type Generation,
  type Project,
  type PrototypeVersion,
} from '@level-zero/domain';

import { type AssetRow, type NewAssetRow } from '../schema/assets';
import { type GenerationRow, type NewGenerationRow } from '../schema/generations';
import { type EntityRow, type NewEntityRow } from '../schema/entities';
import {
  type EntityRelationshipRow,
  type NewEntityRelationshipRow,
} from '../schema/entity-relationships';
import { type EntityVersionRow, type NewEntityVersionRow } from '../schema/entity-versions';
import { type NewProjectRow, type ProjectRow } from '../schema/projects';
import {
  type NewPrototypeEntityVersionRow,
  type NewPrototypeVersionRow,
  type PrototypeEntityVersionRow,
  type PrototypeVersionRow,
} from '../schema/prototype-versions';

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

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    storageKey: row.storageKey,
    checksum: row.checksum,
    width: row.width,
    height: row.height,
    durationSeconds: row.durationSeconds,
    variant: row.variant,
    sourceAssetId: row.sourceAssetId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    createdBy: row.createdBy,
  };
}

export function toAssetRow(asset: Asset): NewAssetRow {
  return {
    id: asset.id,
    projectId: asset.projectId,
    kind: asset.kind,
    filename: asset.filename,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    storageKey: asset.storageKey,
    checksum: asset.checksum,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    variant: asset.variant,
    sourceAssetId: asset.sourceAssetId,
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    archivedAt: asset.archivedAt,
    createdBy: asset.createdBy,
  };
}

export function toGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    projectId: row.projectId,
    capability: row.capability,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    parameters: row.parameters,
    status: row.status,
    inputEntityIds: row.inputEntityIds,
    inputAssetIds: row.inputAssetIds,
    contextEntityIds: row.contextEntityIds,
    outputAssetIds: row.outputAssetIds,
    parentGenerationId: row.parentGenerationId,
    seed: row.seed,
    providerRequestId: row.providerRequestId,
    failure: row.failure,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdBy: row.createdBy,
  };
}

export function toGenerationRow(generation: Generation): NewGenerationRow {
  return {
    id: generation.id,
    projectId: generation.projectId,
    capability: generation.capability,
    provider: generation.provider,
    model: generation.model,
    prompt: generation.prompt,
    parameters: generation.parameters,
    status: generation.status,
    inputEntityIds: generation.inputEntityIds,
    inputAssetIds: generation.inputAssetIds,
    contextEntityIds: generation.contextEntityIds,
    outputAssetIds: generation.outputAssetIds,
    parentGenerationId: generation.parentGenerationId,
    seed: generation.seed,
    providerRequestId: generation.providerRequestId,
    failure: generation.failure,
    createdAt: generation.createdAt,
    startedAt: generation.startedAt,
    completedAt: generation.completedAt,
    createdBy: generation.createdBy,
  };
}

/**
 * A prototype version is stored across two tables: the row itself and one
 * member row per pinned entity version, which the caller passes in already
 * ordered by `position`.
 */
export function toPrototypeVersion(
  row: PrototypeVersionRow,
  members: readonly PrototypeEntityVersionRow[],
): PrototypeVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    prototypeId: row.prototypeId,
    versionNumber: row.versionNumber,
    name: row.name,
    status: row.status,
    notes: row.notes,
    buildAssetId: row.buildAssetId,
    members: members.map((member) => ({
      entityId: member.entityId,
      entityVersionId: member.entityVersionId,
    })),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPrototypeVersionRow(version: PrototypeVersion): NewPrototypeVersionRow {
  return {
    id: version.id,
    projectId: version.projectId,
    prototypeId: version.prototypeId,
    versionNumber: version.versionNumber,
    name: version.name,
    status: version.status,
    notes: version.notes,
    buildAssetId: version.buildAssetId,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

export function toPrototypeEntityVersionRows(
  version: PrototypeVersion,
): NewPrototypeEntityVersionRow[] {
  return version.members.map((member, position) => ({
    prototypeVersionId: version.id,
    projectId: version.projectId,
    entityId: member.entityId,
    entityVersionId: member.entityVersionId,
    position,
  }));
}

/**
 * Escapes the wildcards Postgres `LIKE` understands so a user searching for
 * "100%" does not accidentally match everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
