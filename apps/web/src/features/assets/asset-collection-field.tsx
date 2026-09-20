'use client';

import { Select, Tag } from '@level-zero/ui';

import { useEntitiesByType } from '@/features/entities/use-entities';
import { apiErrorMessage } from '@/lib/api';

import {
  useAddAssetToCollection,
  useAssetCollections,
  useRemoveAssetFromCollection,
} from './use-asset-collections';

/**
 * The mockup's Collection row (#228, `docs/mockups/asset-library.png`): every
 * collection this file is currently filed in, each removable, plus a picker
 * to file it into one more — through #226's membership endpoints.
 *
 * An asset in several collections shows all of them, as chips; removing one
 * only deletes that `contains` edge (`AssetCollectionService.removeAsset`) —
 * the file itself, and its membership in every other collection, is
 * untouched.
 */
export function AssetCollectionField({
  projectId,
  assetId,
}: {
  projectId: string;
  assetId: string;
}) {
  const membership = useAssetCollections(projectId, assetId);
  const allCollections = useEntitiesByType(projectId, 'asset_collection');
  const addToCollection = useAddAssetToCollection(projectId);
  const removeFromCollection = useRemoveAssetFromCollection(projectId);

  if (membership.isPending) {
    return <p className="text-faint-foreground">Loading…</p>;
  }

  const memberOf = membership.data ?? [];
  const memberIds = new Set(memberOf.map((collection) => collection.id));
  const available = (allCollections.data?.items ?? []).filter(
    (collection) => !memberIds.has(collection.id),
  );
  const error = addToCollection.error ?? removeFromCollection.error;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {memberOf.length === 0 && (
          <span className="text-faint-foreground">Not in a collection</span>
        )}
        {memberOf.map((collection) => (
          <Tag
            key={collection.id}
            onRemove={() => removeFromCollection.mutate({ collectionId: collection.id, assetId })}
          >
            {collection.name}
          </Tag>
        ))}
      </div>

      {available.length > 0 && (
        <Select
          aria-label="Add to collection"
          value=""
          onChange={(event) => {
            const collectionId = event.target.value;
            if (collectionId) addToCollection.mutate({ collectionId, assetId });
          }}
          className="h-7 px-2 text-xs"
        >
          <option value="">+ Add to collection</option>
          {available.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </Select>
      )}

      {error != null && (
        <p className="text-error">
          {apiErrorMessage(error, 'Could not change the collections for this file.')}
        </p>
      )}
    </div>
  );
}
