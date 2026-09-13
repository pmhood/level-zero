'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';
import { useState } from 'react';

import { assetContentUrl } from '@/lib/api';

import { AssetKindPlaceholderIcon } from './asset-kind-icons';

/**
 * A grid tile's media area: the generated thumbnail's bytes (#176) where one
 * exists, lazy-loaded, falling back to the source's own bytes at display
 * size otherwise. That fallback is the normal path, not an error one — every
 * asset uploaded before the backfill lands, and any whose thumbnail job is
 * still running or failed for good, is in exactly that state.
 *
 * Everything else — video, audio, 3D, exports, build artifacts, and any
 * image whose bytes fail to load (a missing storage reference) — gets a
 * type-appropriate placeholder instead of a broken image.
 */
export function AssetPreview({
  projectId,
  asset,
  summary,
}: {
  projectId: string;
  asset: Asset;
  summary?: AssetSummary;
}) {
  const [failed, setFailed] = useState(false);
  const isImage = asset.mimeType.startsWith('image/');

  if (!isImage || failed) {
    return (
      <div className="flex size-full items-center justify-center text-faint-foreground">
        <AssetKindPlaceholderIcon kind={asset.kind} className="size-8" />
      </div>
    );
  }

  const contentAssetId = summary?.thumbnailAssetId ?? asset.id;

  return (
    <img
      src={assetContentUrl(projectId, contentAssetId)}
      alt={asset.filename}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
