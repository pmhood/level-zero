import { type EntityVersion } from './entity-version';

export interface VersionListFilter {
  branchName?: string;
  limit?: number;
  offset?: number;
}

export interface VersionPage {
  items: EntityVersion[];
  total: number;
}

/**
 * Storage port for entity versions.
 *
 * There is deliberately no update or delete: a version is immutable once
 * written, and history is never rewritten.
 */
export interface EntityVersionRepository {
  insert(version: EntityVersion): Promise<EntityVersion>;
  findById(projectId: string, versionId: string): Promise<EntityVersion | null>;
  listForEntity(
    projectId: string,
    entityId: string,
    filter: VersionListFilter,
  ): Promise<VersionPage>;
  /** Highest `versionNumber` recorded for the entity, or 0 when it has none. */
  latestVersionNumber(projectId: string, entityId: string): Promise<number>;
  /** Tip of a branch: its highest-numbered version, or null if the branch is new. */
  findBranchTip(
    projectId: string,
    entityId: string,
    branchName: string,
  ): Promise<EntityVersion | null>;
  /** Distinct branch names recorded for the entity. */
  listBranches(projectId: string, entityId: string): Promise<string[]>;
}
