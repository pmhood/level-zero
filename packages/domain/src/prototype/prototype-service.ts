import { type ActivityService } from '../activity/activity-service';
import { type Asset } from '../asset/asset';
import { type AssetRepository } from '../asset/asset-repository';
import { type Entity } from '../entity/entity';
import { type EntityService } from '../entity/entity-service';
import { findPromotion } from '../promotion/promotion-definition';
import { type EntityRelationshipService } from '../relationship/entity-relationship-service';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import { type EntityVersion } from '../version/entity-version';
import { type EntityVersionRepository } from '../version/entity-version-repository';
import { comparePrototypeVersions, type PrototypeVersionComparison } from './compare';
import {
  annotatePrototypeVersion,
  createPrototypeVersion,
  type AnnotatePrototypeVersionInput,
  type PrototypeMember,
  type PrototypeVersion,
  type PrototypeVersionStatus,
} from './prototype-version';
import {
  type PrototypeVersionListFilter,
  type PrototypeVersionPage,
  type PrototypeVersionRepository,
} from './prototype-version-repository';

export interface PrototypeServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/** An entity to include, optionally pinned to a version other than its current one. */
export interface PrototypeMemberInput {
  entityId: string;
  /** Defaults to the entity's current version. */
  entityVersionId?: string | null;
}

export interface CapturePrototypeVersionInput {
  name?: string | null;
  status?: PrototypeVersionStatus;
  notes?: string | null;
  buildAssetId?: string | null;
  /** The entities this version is assembled from. */
  members: readonly PrototypeMemberInput[];
  createdBy?: string | null;
}

export interface CreatePrototypeInput extends CapturePrototypeVersionInput {
  /** Name of the prototype itself, not of its first version. */
  prototypeName: string;
  description?: string | null;
  tags?: string[];
  data?: Record<string, unknown>;
  /**
   * Set when this prototype is being promoted from a mechanic, system or scene
   * (the promotion registry's flow 3). Validated against the same catalogue
   * `LineageService.promote` reads, and recorded as a `promoted_to` edge from
   * this entity to the new prototype — the pin in `members` already captures
   * which version it was built from.
   */
  promotedFromEntityId?: string;
}

/** A new prototype and the first version recording what it was assembled from. */
export interface PrototypeCreation {
  prototype: Entity;
  version: PrototypeVersion;
}

/** A prototype version with everything it pins resolved to the thing it names. */
export interface PrototypeContents {
  prototype: Entity;
  version: PrototypeVersion;
  /** The pinned versions, in the order the prototype version recorded them. */
  entityVersions: EntityVersion[];
  buildAsset: Asset | null;
}

/**
 * Playable experiments, recorded against the exact creative versions they
 * represent.
 *
 * A prototype is an ordinary `Entity` of type `prototype`; this service adds
 * the part an entity cannot express — an immutable set of `EntityVersion`
 * references per version. Capturing resolves each member to a version *at that
 * moment*, so v1 still resolves to the characters, mechanics and scenes it was
 * actually built from long after those entities have moved on.
 */
export class PrototypeService {
  constructor(
    private readonly prototypeVersions: PrototypeVersionRepository,
    private readonly entities: EntityService,
    private readonly entityVersions: EntityVersionRepository,
    private readonly assets: AssetRepository,
    private readonly activity: ActivityService,
    private readonly relationships: EntityRelationshipService,
    private readonly deps: PrototypeServiceDeps,
  ) {}

  /**
   * Creates the prototype entity and captures its first version in one step.
   *
   * `promotedFromEntityId`, when given, is validated against the promotion
   * catalogue before anything is created — this is flow 3's own guard,
   * `PrototypeService.create` never goes through `LineageService.promote` — and
   * a `promoted_to` edge is recorded once the prototype exists.
   */
  async create(projectId: string, input: CreatePrototypeInput): Promise<PrototypeCreation> {
    const promotionSource = input.promotedFromEntityId
      ? await this.requirePromotionSource(projectId, input.promotedFromEntityId)
      : null;

    const prototype = await this.entities.create(projectId, {
      type: 'prototype',
      name: input.prototypeName,
      description: input.description ?? null,
      tags: input.tags ?? [],
      data: input.data ?? {},
    });

    const version = await this.capture(projectId, prototype.id, input);

    if (promotionSource) {
      await this.relationships.link(projectId, {
        sourceEntityId: promotionSource.id,
        targetEntityId: prototype.id,
        relation: 'promoted_to',
        metadata: { fromType: promotionSource.type, toType: 'prototype' },
      });
    }

    return { prototype, version };
  }

  /**
   * Records a new version of the prototype from the entities given.
   *
   * A member without an explicit `entityVersionId` pins the entity's current
   * version, which is what makes "prototype this as it stands" safe: the
   * reference is resolved once, here, and never re-resolved on read.
   */
  async capture(
    projectId: string,
    prototypeId: string,
    input: CapturePrototypeVersionInput,
  ): Promise<PrototypeVersion> {
    const prototype = await this.requirePrototype(projectId, prototypeId);

    const members = await this.resolveMembers(projectId, input.members);
    await this.requireBuildAsset(projectId, input.buildAssetId);

    const versionNumber =
      (await this.prototypeVersions.latestVersionNumber(projectId, prototypeId)) + 1;

    const version = await this.prototypeVersions.insert(
      createPrototypeVersion(
        { ...input, projectId, prototypeId, versionNumber, members },
        this.deps,
      ),
    );

    await this.activity.record({
      projectId,
      type: 'prototype_version_created',
      summary: `${prototype.name} v${version.versionNumber} created${
        version.name ? `: ${version.name}` : ''
      }`,
      subjectType: 'prototype_version',
      subjectId: version.id,
      metadata: {
        prototypeId: prototype.id,
        prototypeName: prototype.name,
        versionNumber: version.versionNumber,
        memberCount: version.members.length,
      },
      actor: version.createdBy,
    });

    return version;
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, prototypeVersionId: string): Promise<PrototypeVersion> {
    const version = await this.prototypeVersions.findById(projectId, prototypeVersionId);
    if (!version) throw new NotFoundError('Prototype version', prototypeVersionId);
    return version;
  }

  async list(
    projectId: string,
    prototypeId: string,
    filter: PrototypeVersionListFilter = {},
  ): Promise<PrototypeVersionPage> {
    await this.entities.getById(projectId, prototypeId);
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.prototypeVersions.listForPrototype(projectId, prototypeId, { limit, offset });
  }

  /**
   * Resolves a prototype version to the historical content it names.
   *
   * The entity versions come back as they were captured, not as the entities
   * read today, which is the whole point of pinning them.
   */
  async contents(projectId: string, prototypeVersionId: string): Promise<PrototypeContents> {
    const version = await this.getById(projectId, prototypeVersionId);
    const prototype = await this.entities.getById(projectId, version.prototypeId);

    const entityVersions = await Promise.all(
      version.members.map((member) => this.requireEntityVersion(projectId, member.entityVersionId)),
    );

    return {
      prototype,
      version,
      entityVersions,
      buildAsset: version.buildAssetId
        ? await this.assets.findById(projectId, version.buildAssetId)
        : null,
    };
  }

  /** Which entity versions were added, removed or changed between two versions. */
  async compare(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<PrototypeVersionComparison> {
    const [from, to] = await Promise.all([
      this.getById(projectId, fromVersionId),
      this.getById(projectId, toVersionId),
    ]);

    if (from.prototypeId !== to.prototypeId) {
      throw new ValidationError('Both versions must belong to the same prototype', {
        fromPrototypeId: from.prototypeId,
        toPrototypeId: to.prototypeId,
      });
    }

    return comparePrototypeVersions(from, to);
  }

  /**
   * Updates a version's status, notes or build artifact.
   *
   * The pinned members are never touched: a different set of entity versions is
   * a new prototype version, not an edit of an old one.
   */
  async annotate(
    projectId: string,
    prototypeVersionId: string,
    input: AnnotatePrototypeVersionInput,
  ): Promise<PrototypeVersion> {
    const version = await this.getById(projectId, prototypeVersionId);
    await this.requireBuildAsset(projectId, input.buildAssetId);

    return this.prototypeVersions.save(annotatePrototypeVersion(version, input, this.deps));
  }

  /**
   * Pins every member to an exact entity version, checking each one belongs to
   * this project and to the entity it is recorded against.
   */
  private async resolveMembers(
    projectId: string,
    members: readonly PrototypeMemberInput[],
  ): Promise<PrototypeMember[]> {
    const resolved: PrototypeMember[] = [];

    for (const member of members) {
      const entity = await this.entities.getById(projectId, member.entityId);

      if (!member.entityVersionId) {
        if (!entity.currentVersionId) {
          throw new ConflictError('Commit a version of the entity before prototyping it', {
            entityId: entity.id,
          });
        }
        resolved.push({ entityId: entity.id, entityVersionId: entity.currentVersionId });
        continue;
      }

      const version = await this.requireEntityVersion(projectId, member.entityVersionId);
      if (version.entityId !== entity.id) {
        throw new ValidationError('The version does not belong to the entity it is pinned to', {
          entityId: entity.id,
          entityVersionId: version.id,
        });
      }
      resolved.push({ entityId: entity.id, entityVersionId: version.id });
    }

    return resolved;
  }

  /** Flow 3's own catalogue guard — `create` never delegates to `LineageService.promote`. */
  private async requirePromotionSource(projectId: string, entityId: string): Promise<Entity> {
    const source = await this.entities.getById(projectId, entityId);

    if (!findPromotion(source.type, 'prototype')) {
      throw new ValidationError('This promotion is not offered', {
        entityId: source.id,
        sourceType: source.type,
        targetType: 'prototype',
      });
    }

    return source;
  }

  private async requireEntityVersion(
    projectId: string,
    entityVersionId: string,
  ): Promise<EntityVersion> {
    const version = await this.entityVersions.findById(projectId, entityVersionId);
    if (!version) throw new NotFoundError('Entity version', entityVersionId);
    return version;
  }

  private async requireBuildAsset(
    projectId: string,
    buildAssetId: string | null | undefined,
  ): Promise<void> {
    if (!buildAssetId) return;
    const asset = await this.assets.findById(projectId, buildAssetId);
    if (!asset) throw new NotFoundError('Asset', buildAssetId);
  }

  /** Versions are only ever captured against an active `prototype` entity. */
  private async requirePrototype(projectId: string, prototypeId: string): Promise<Entity> {
    const prototype = await this.entities.getById(projectId, prototypeId);

    if (prototype.type !== 'prototype') {
      throw new ValidationError('Prototype versions can only be captured for a prototype entity', {
        entityId: prototype.id,
        type: prototype.type,
      });
    }
    if (prototype.status === 'archived') {
      throw new ConflictError('Restore the prototype before capturing a version of it', {
        entityId: prototype.id,
      });
    }

    return prototype;
  }
}
