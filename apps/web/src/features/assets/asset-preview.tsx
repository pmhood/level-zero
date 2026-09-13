'use client';

import type { Asset } from '@level-zero/domain';
import { useState } from 'react';

import { assetContentUrl } from '@/lib/api';

import { AssetKindPlaceholderIcon } from './asset-kind-icons';

/**
 * A grid tile's media area: the asset's own bytes at display size for
 * anything with an image MIME type, lazy-loaded rather than a generated
 * thumbnail (#176 is what makes that cheap; this issue renders the source).
 *
 * Everything else — video, audio, 3D, exports, build artifacts, and any
 * image whose bytes fail to load (a missing storage reference) — gets a
 * type-appropriate placeholder instead of a broken image.
 */
export function AssetPreview({ projectId, asset }: { projectId: string; asset: Asset }) {
  const [failed, setFailed] = useState(false);
  const isImage = asset.mimeType.startsWith('image/');

  if (!isImage || failed) {
    return (
      <div className="flex size-full items-center justify-center text-faint-foreground">
        <AssetKindPlaceholderIcon kind={asset.kind} className="size-8" />
      </div>
    );
  }

  return (
    <img
      src={assetContentUrl(projectId, asset.id)}
      alt={asset.filename}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
