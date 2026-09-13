'use client';

import type { Asset } from '@level-zero/domain';
import { useState } from 'react';

import { assetContentUrl } from '@/lib/api';

import { AssetKindPlaceholderIcon } from './asset-kind-icons';
import { assetKindLabel, formatByteSize, formatDimensionsOrDuration } from './asset-presentation';

/** The element that can actually show this file, if a browser has one. */
function previewElement(asset: Asset): 'image' | 'video' | 'audio' | 'none' {
  if (asset.mimeType.startsWith('image/')) return 'image';
  if (asset.mimeType.startsWith('video/')) return 'video';
  if (asset.mimeType.startsWith('audio/')) return 'audio';
  return 'none';
}

/**
 * The inspector's preview: the file itself wherever a browser can render or
 * play it, and the file's own facts wherever it cannot.
 *
 * A 3D file, an export and a build artifact have no preview and never will
 * have one here, so they get the facts that identify them instead — kind,
 * size, and dimensions or duration. A file whose bytes do not load falls back
 * to the same placeholder and says so, because a missing storage reference is
 * a thing to read rather than a broken image.
 *
 * `object-contain` rather than the grid tile's `object-cover`: the grid is
 * scanning a wall of thumbnails, and the inspector is looking at one file.
 */
export function AssetInspectorPreview({ projectId, asset }: { projectId: string; asset: Asset }) {
  const [failed, setFailed] = useState(false);
  const element = failed ? 'none' : previewElement(asset);
  const src = assetContentUrl(projectId, asset.id);

  if (element === 'image') {
    return (
      <Frame>
        <img
          src={src}
          alt={asset.filename}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </Frame>
    );
  }

  if (element === 'video') {
    return (
      <Frame>
        <video
          src={src}
          controls
          aria-label={asset.filename}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </Frame>
    );
  }

  if (element === 'audio') {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-raised p-3">
        <FileFacts asset={asset} />
        <audio
          src={src}
          controls
          aria-label={asset.filename}
          className="w-full"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col items-center gap-2 p-3 text-center">
        <AssetKindPlaceholderIcon kind={asset.kind} className="size-8 text-faint-foreground" />
        <FileFacts asset={asset} />
        {failed && (
          <p className="text-xs text-faint-foreground">
            These bytes could not be read from storage.
          </p>
        )}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-raised">
      {children}
    </div>
  );
}

/** What the file is, for anything that cannot be shown. */
function FileFacts({ asset }: { asset: Asset }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-foreground">{assetKindLabel(asset.kind)}</p>
      <p className="text-xs text-faint-foreground">
        {formatByteSize(asset.byteSize)} · {formatDimensionsOrDuration(asset)}
      </p>
      <p className="truncate text-xs text-faint-foreground">{asset.mimeType}</p>
    </div>
  );
}
