import { type AssetRepository } from '../asset/asset-repository';
import { type EntityRepository } from '../entity/entity-repository';
import { type PrototypeVersionRepository } from '../prototype/prototype-version-repository';
import { NotFoundError } from '../shared/errors';
import { type EntityVersionRepository } from '../version/entity-version-repository';
import { type ResolvedReviewTarget, type ReviewTarget } from './review-target';

/**
 * Reads whatever a `ReviewTarget` points at.
 *
 * Three target types means three lookups, and this is where they live so that
 * neither service repeats them. It is a switch over a closed vocabulary, not a
 * registry: a fourth target type is a fourth case here and a compile error
 * until it is written.
 *
 * The lookups are project-scoped like every other read, so a target in another
 * project resolves to nothing at all — a caller cannot use a comment to probe
 * whether another project's entity exists.
 */
export class ReviewTargetResolver {
  constructor(
    private readonly entities: EntityRepository,
    private readonly assets: AssetRepository,
    private readonly prototypeVersions: PrototypeVersionRepository,
    private readonly entityVersions: EntityVersionRepository,
  ) {}

  /**
   * The target as it stands, or null when it no longer resolves.
   *
   * Forgiving on purpose: this is the read path, and a comment whose target has
   * gone is still a comment worth rendering.
   */
  async resolve(projectId: string, target: ReviewTarget): Promise<ResolvedReviewTarget | null> {
    switch (target.type) {
      case 'entity': {
        const entity = await this.entities.findById(projectId, target.id);
        if (!entity) return null;
        return {
          target,
          label: entity.name,
          archived: entity.status === 'archived',
          currentVersionId: entity.currentVersionId,
        };
      }
      case 'asset': {
        const asset = await this.assets.findById(projectId, target.id);
        if (!asset) return null;
        return {
          target,
          label: asset.filename,
          archived: asset.status === 'archived',
          currentVersionId: null,
        };
      }
      case 'prototype_version': {
        const version = await this.prototypeVersions.findById(projectId, target.id);
        if (!version) return null;
        return {
          target,
          // The number is the identity; the name is an optional label.
          label: version.name ?? `v${version.versionNumber}`,
          archived: version.status === 'archived',
          // A prototype version *is* the immutable thing reviewed, so there is
          // no further version to pin a judgement to.
          currentVersionId: null,
        };
      }
    }
  }

  /**
   * The target, or a `NotFoundError` — the write path, where a comment or a
   * decision about something that does not exist is a mistake to report rather
   * than a row to keep.
   *
   * A version pin is checked against the entity it claims, so a decision cannot
   * cite another entity's history. Postgres enforces the same thing with a
   * composite foreign key; this is what turns it into a 404 instead of a 500.
   */
  async requireTarget(projectId: string, target: ReviewTarget): Promise<ResolvedReviewTarget> {
    const resolved = await this.resolve(projectId, target);
    if (!resolved) throw new NotFoundError(RESOURCE_NAMES[target.type], target.id);

    if (target.versionId !== null) {
      const version = await this.entityVersions.findById(projectId, target.versionId);
      if (!version || version.entityId !== target.id) {
        throw new NotFoundError('Entity version', target.versionId);
      }
    }

    return resolved;
  }
}

const RESOURCE_NAMES: Record<ReviewTarget['type'], string> = {
  entity: 'Entity',
  asset: 'Asset',
  prototype_version: 'Prototype version',
};
