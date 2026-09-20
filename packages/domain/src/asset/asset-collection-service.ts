import { type Entity } from '../entity/entity';
import { type EntityService } from '../entity/entity-service';
import { type EntityRelationship } from '../relationship/entity-relationship';
import { type EntityRelationshipService } from '../relationship/entity-relationship-service';
import { NotFoundError, ValidationError } from '../shared/errors';
import { type AssetRepository } from './asset-repository';

export interface CreateAssetCollectionInput {
  name: string;
  description?: string | null;
  tags?: string[];
}

/**
 * Collections group assets for a team's own art direction — "Props & Gear",
 * "UI & HUD" — the way `docs/decisions/asset-library-model.md` §4 settles
 * it: a collection is an ordinary `Entity` of type `asset_collection`, and
 * membership is a `contains` `EntityRelationship` from the collection to the
 * asset's `asset_reference` entity. No table of its own, and this service
 * has no repository of its own either — it composes `EntityService` and
 * `EntityRelationshipService`, the same two collaborators every other
 * membership edge in the project graph is built from.
 *
 * An asset can be in several collections at once, and a collection never
 * owns the assets in it: `removeAsset` deletes the membership edge only, and
 * archiving a collection touches no member asset. This service is the one
 * place that writes a `contains` edge from a collection, which is what lets
 * it be the one place that has to keep that edge pointing at an
 * `asset_reference` entity — nothing else writes them.
 */
export class AssetCollectionService {
  constructor(
    private readonly entities: EntityService,
    private readonly relationships: EntityRelationshipService,
    private readonly assets: AssetRepository,
  ) {}

  async create(projectId: string, input: CreateAssetCollectionInput): Promise<Entity> {
    return this.entities.create(projectId, { ...input, type: 'asset_collection' });
  }

  async rename(projectId: string, collectionId: string, name: string): Promise<Entity> {
    await this.requireCollection(projectId, collectionId);
    return this.entities.update(projectId, collectionId, { name });
  }

  /**
   * Delete-as-archive, the same lifecycle every entity uses: the collection
   * drops out of normal listings, but every asset that was in it — and every
   * one of its other collections — is untouched.
   */
  async archive(projectId: string, collectionId: string): Promise<Entity> {
    await this.requireCollection(projectId, collectionId);
    return this.entities.archive(projectId, collectionId);
  }

  /**
   * Files an asset into a collection.
   *
   * Reuses (or creates) the one `asset_reference` entity that stands for
   * `assetId` in this project — atomic against a concurrent caller doing the
   * same for another collection — then links the collection to it with
   * `contains`. Adding the same asset to the same collection twice is
   * refused by the edge's own uniqueness, the same as any other duplicate
   * link.
   */
  async addAsset(
    projectId: string,
    collectionId: string,
    assetId: string,
  ): Promise<EntityRelationship> {
    await this.requireCollection(projectId, collectionId);
    const asset = await this.assets.findById(projectId, assetId);
    if (!asset) throw new NotFoundError('Asset', assetId);

    const reference = await this.entities.findOrCreateAssetReference(projectId, assetId, {
      name: asset.filename,
    });

    return this.relationships.link(projectId, {
      sourceEntityId: collectionId,
      targetEntityId: reference.id,
      relation: 'contains',
    });
  }

  /**
   * Takes an asset out of a collection.
   *
   * Deletes the membership edge only: the asset, its bytes, its
   * `asset_reference` entity, and its membership in every other collection
   * are untouched. A no-op, not an error, if the asset was never in this
   * collection — nothing is found to delete, and nothing is created looking
   * for it.
   */
  async removeAsset(projectId: string, collectionId: string, assetId: string): Promise<void> {
    await this.requireCollection(projectId, collectionId);

    const reference = await this.entities.findAssetReference(projectId, assetId);
    if (!reference) return;

    const edge = await this.relationships.findEdge(
      projectId,
      collectionId,
      reference.id,
      'contains',
    );
    if (!edge) return;

    await this.relationships.unlink(projectId, edge.id);
  }

  /**
   * Every collection this asset currently belongs to (the inspector's
   * Collection field, #228).
   *
   * Reads the same edge `addAsset` writes, from the other end: the asset's
   * `asset_reference` entity's incoming `contains` edges, sourced from
   * whichever collections currently point at it. Empty when the asset has no
   * `asset_reference` entity yet — never filed into any collection — rather
   * than materializing one just to find it empty.
   */
  async listForAsset(projectId: string, assetId: string): Promise<Entity[]> {
    const reference = await this.entities.findAssetReference(projectId, assetId);
    if (!reference) return [];

    const { incoming } = await this.relationships.neighborhood(projectId, reference.id, {
      direction: 'incoming',
      relations: ['contains'],
    });

    return incoming.map((edge) => edge.entity);
  }

  /** Collections are entities, so a wrong-typed id reads the same as a missing one. */
  private async requireCollection(projectId: string, collectionId: string): Promise<Entity> {
    const collection = await this.entities.getById(projectId, collectionId);
    if (collection.type !== 'asset_collection') {
      throw new ValidationError('That entity is not an asset collection', {
        entityId: collection.id,
        type: collection.type,
      });
    }
    return collection;
  }
}
