import { type PrototypeVersion } from './prototype-version';

export interface PrototypeVersionListFilter {
  limit?: number;
  offset?: number;
}

export interface PrototypeVersionPage {
  items: PrototypeVersion[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for prototype versions.
 *
 * There is no delete: a prototype version is a record of what was played, and
 * `save` only ever carries updated annotations — the pinned members it was
 * inserted with are never rewritten.
 */
export interface PrototypeVersionRepository {
  insert(version: PrototypeVersion): Promise<PrototypeVersion>;
  findById(projectId: string, prototypeVersionId: string): Promise<PrototypeVersion | null>;
  listForPrototype(
    projectId: string,
    prototypeId: string,
    filter: PrototypeVersionListFilter,
  ): Promise<PrototypeVersionPage>;
  /**
   * Every prototype version in the project, across every prototype, in no
   * guaranteed order — for building a consistency scan's `ProjectFacts`.
   */
  listByProject(
    projectId: string,
    filter: PrototypeVersionListFilter,
  ): Promise<PrototypeVersionPage>;
  /** Highest `versionNumber` recorded for the prototype, or 0 when it has none. */
  latestVersionNumber(projectId: string, prototypeId: string): Promise<number>;
  /** Persists annotation changes only. */
  save(version: PrototypeVersion): Promise<PrototypeVersion>;
}
