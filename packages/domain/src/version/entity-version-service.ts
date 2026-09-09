import { type ActivityService } from '../activity/activity-service';
import {
  applyEntitySnapshot,
  snapshotEntity,
  withCurrentVersion,
  type Entity,
} from '../entity/entity';
import { type EntityRepository } from '../entity/entity-repository';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import { compareVersions, type VersionComparison } from './compare';
import {
  DEFAULT_BRANCH,
  createEntityVersion,
  type EntityVersion,
  type VersionReason,
} from './entity-version';
import {
  type EntityVersionRepository,
  type VersionListFilter,
  type VersionPage,
} from './entity-version-repository';

export interface VersionServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface CommitVersionInput {
  reason?: VersionReason;
  branchName?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface BranchInput {
  branchName: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface PromoteVersionInput {
  /** Branch to promote onto. Defaults to `main`. */
  branchName?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

/** Everything a history view needs to draw the version graph in one call. */
export interface EntityHistory {
  entityId: string;
  currentVersionId: string | null;
  branches: string[];
  versions: EntityVersion[];
  total: number;
}

/**
 * Meaningful creative history for an entity.
 *
 * The entity row is the working copy; versions are the points a user chose to
 * keep. Editing an entity does not write a version, so autosave and undo (issue
 * #14) cannot flood the history.
 *
 * Restore, branch and promote all *add* a version. Nothing rewrites or removes
 * one, so later history survives every operation.
 */
export class EntityVersionService {
  constructor(
    private readonly versions: EntityVersionRepository,
    private readonly entities: EntityRepository,
    private readonly activity: ActivityService,
    private readonly deps: VersionServiceDeps,
  ) {}

  /** Records the entity's current content as a new version on its branch. */
  async commit(
    projectId: string,
    entityId: string,
    input: CommitVersionInput = {},
  ): Promise<EntityVersion> {
    const entity = await this.requireEditableEntity(projectId, entityId);
    const parent = await this.currentVersion(projectId, entity);

    const branchName = input.branchName ?? parent?.branchName ?? DEFAULT_BRANCH;
    return this.append(entity, {
      parentVersionId: parent?.id ?? null,
      branchName,
      snapshot: snapshotEntity(entity),
      reason: input.reason ?? 'manual',
      metadata: input.metadata,
      createdBy: input.createdBy,
    });
  }

  async getById(projectId: string, versionId: string): Promise<EntityVersion> {
    const version = await this.versions.findById(projectId, versionId);
    if (!version) throw new NotFoundError('Entity version', versionId);
    return version;
  }

  async list(
    projectId: string,
    entityId: string,
    filter: VersionListFilter = {},
  ): Promise<VersionPage> {
    await this.requireEntity(projectId, entityId);
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.versions.listForEntity(projectId, entityId, { ...filter, limit, offset });
  }

  /**
   * The full picture for a history UI: every version with its parent and
   * branch, the branch names in play, and which version is current.
   */
  async history(
    projectId: string,
    entityId: string,
    filter: VersionListFilter = {},
  ): Promise<EntityHistory> {
    const entity = await this.requireEntity(projectId, entityId);
    const [page, branches] = await Promise.all([
      this.list(projectId, entityId, filter),
      this.versions.listBranches(projectId, entityId),
    ]);

    return {
      entityId: entity.id,
      currentVersionId: entity.currentVersionId,
      branches,
      versions: page.items,
      total: page.total,
    };
  }

  async compare(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<VersionComparison> {
    const [from, to] = await Promise.all([
      this.getById(projectId, fromVersionId),
      this.getById(projectId, toVersionId),
    ]);

    if (from.entityId !== to.entityId) {
      throw new ValidationError('Both versions must belong to the same entity', {
        fromEntityId: from.entityId,
        toEntityId: to.entityId,
      });
    }

    return compareVersions(from, to);
  }

  /**
   * Re-applies a historical version to the entity, on the same branch.
   *
   * The restored content becomes a *new* version whose parent is the version
   * that was current, so everything created after the restored point is still
   * there and still reachable.
   */
  async restoreVersion(
    projectId: string,
    versionId: string,
    input: CommitVersionInput = {},
  ): Promise<EntityVersion> {
    const version = await this.getById(projectId, versionId);
    const entity = await this.requireEditableEntity(projectId, version.entityId);
    const parent = await this.currentVersion(projectId, entity);

    return this.append(entity, {
      parentVersionId: parent?.id ?? null,
      branchName: parent?.branchName ?? version.branchName,
      snapshot: version.snapshot,
      reason: 'restore',
      metadata: {
        restoredFromVersionId: version.id,
        restoredFromVersionNumber: version.versionNumber,
        ...(input.metadata ?? {}),
      },
      createdBy: input.createdBy,
    });
  }

  /**
   * Starts a new line of work from an earlier version.
   *
   * The branch tip becomes the entity's current version, so subsequent commits
   * continue on the branch and leave the original line untouched.
   */
  async branch(projectId: string, versionId: string, input: BranchInput): Promise<EntityVersion> {
    const version = await this.getById(projectId, versionId);
    const entity = await this.requireEditableEntity(projectId, version.entityId);

    const branchName = input.branchName.trim();
    if (branchName === version.branchName) {
      throw new ValidationError('Branch into a different name from the source version', {
        branchName,
      });
    }
    const existingTip = await this.versions.findBranchTip(projectId, entity.id, branchName);
    if (existingTip) {
      throw new ConflictError(`Branch "${branchName}" already exists for this entity`, {
        branchName,
        versionId: existingTip.id,
      });
    }

    return this.append(entity, {
      parentVersionId: version.id,
      branchName,
      snapshot: version.snapshot,
      reason: 'branch',
      metadata: { branchedFromVersionId: version.id, ...(input.metadata ?? {}) },
      createdBy: input.createdBy,
    });
  }

  /**
   * Brings a version's content onto another branch, `main` by default.
   *
   * Like restore, this appends: the target branch keeps its own history and the
   * source branch is left intact.
   */
  async promote(
    projectId: string,
    versionId: string,
    input: PromoteVersionInput = {},
  ): Promise<EntityVersion> {
    const version = await this.getById(projectId, versionId);
    const entity = await this.requireEditableEntity(projectId, version.entityId);

    const branchName = input.branchName ?? DEFAULT_BRANCH;
    if (branchName === version.branchName) {
      throw new ValidationError('Promote a version onto a different branch', { branchName });
    }

    const tip = await this.versions.findBranchTip(projectId, entity.id, branchName);
    return this.append(entity, {
      parentVersionId: tip?.id ?? version.id,
      branchName,
      snapshot: version.snapshot,
      reason: 'promotion',
      metadata: { promotedFromVersionId: version.id, ...(input.metadata ?? {}) },
      createdBy: input.createdBy,
    });
  }

  /**
   * Writes the version, applies its snapshot to the entity and moves the
   * entity's pointer, so the entity and its history never disagree.
   */
  private async append(
    entity: Entity,
    input: {
      parentVersionId: string | null;
      branchName: string;
      snapshot: ReturnType<typeof snapshotEntity>;
      reason: VersionReason;
      metadata?: Record<string, unknown>;
      createdBy?: string | null;
    },
  ): Promise<EntityVersion> {
    const versionNumber =
      (await this.versions.latestVersionNumber(entity.projectId, entity.id)) + 1;

    const version = await this.versions.insert(
      createEntityVersion(
        {
          projectId: entity.projectId,
          entityId: entity.id,
          versionNumber,
          parentVersionId: input.parentVersionId,
          branchName: input.branchName,
          snapshot: input.snapshot,
          reason: input.reason,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          createdBy: input.createdBy ?? null,
        },
        this.deps,
      ),
    );

    const restored = applyEntitySnapshot(entity, version.snapshot, this.deps);
    await this.entities.save(withCurrentVersion(restored, version.id, this.deps));

    await this.activity.record({
      projectId: entity.projectId,
      type: version.reason === 'restore' ? 'entity_version_restored' : 'entity_version_created',
      summary: versionSummary(version),
      subjectType: 'entity_version',
      subjectId: version.id,
      metadata: {
        entityId: entity.id,
        entityType: entity.type,
        // The version's own name, not the entity's current one: for a
        // restore, branch or promotion those two can disagree.
        entityName: version.snapshot.name,
        versionNumber: version.versionNumber,
        reason: version.reason,
        branchName: version.branchName,
      },
      actor: version.createdBy,
    });

    return version;
  }

  private async currentVersion(projectId: string, entity: Entity): Promise<EntityVersion | null> {
    if (!entity.currentVersionId) return null;
    return this.versions.findById(projectId, entity.currentVersionId);
  }

  private async requireEntity(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.entities.findById(projectId, entityId);
    if (!entity) throw new NotFoundError('Entity', entityId);
    return entity;
  }

  /** History can be read for any entity; writing to one requires it be active. */
  private async requireEditableEntity(projectId: string, entityId: string): Promise<Entity> {
    const entity = await this.requireEntity(projectId, entityId);
    if (entity.status === 'archived') {
      throw new ConflictError('Restore the entity before changing its version history', {
        entityId,
      });
    }
    return entity;
  }
}

/**
 * The activity sentence for one version, worded by why it was recorded.
 *
 * Uses the version's own snapshot name rather than the entity's current
 * name: a restore, branch or promotion writes a version whose content can
 * differ from what the entity is called right before the operation runs.
 */
function versionSummary(version: EntityVersion): string {
  const name = version.snapshot.name;

  switch (version.reason) {
    case 'restore': {
      const from = version.metadata.restoredFromVersionNumber;
      return typeof from === 'number' ? `${name} restored to v${from}` : `${name} restored`;
    }
    case 'branch':
      return `${name} branched to "${version.branchName}"`;
    case 'promotion':
      return `${name} — v${version.versionNumber} promoted to "${version.branchName}"`;
    default:
      return `${name} — v${version.versionNumber} saved`;
  }
}
