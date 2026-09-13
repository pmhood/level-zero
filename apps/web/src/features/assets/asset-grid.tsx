'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';
import { MediaCard, MediaCardSkeleton, StatusBadge } from '@level-zero/ui';

import { AssetPreview } from './asset-preview';
import { assetKindLabel, assetStatusBadge, formatRelativeTime } from './asset-presentation';

/** The AI-purple treatment for the "Generated" pill — spec: purple is reserved for AI/generative actions. */
const AI_BADGE_CLASSNAME =
  'border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground';

const GRID_CLASSNAME = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

export interface AssetGridProps {
  projectId: string;
  assets: Asset[];
  summaries: ReadonlyMap<string, AssetSummary>;
  selectedId: string | null;
  onSelect: (asset: Asset) => void;
}

/**
 * The grid presentation (issue #171): one `MediaCard` per asset, 1:1 per
 * spec section 13's ratio table, a status pill from #170's summary and a
 * type-appropriate preview for anything that is not a loadable image.
 */
export function AssetGrid({ projectId, assets, summaries, selectedId, onSelect }: AssetGridProps) {
  return (
    <ul role="list" aria-label="Assets" className={GRID_CLASSNAME}>
      {assets.map((asset) => {
        const badge = assetStatusBadge(asset, summaries.get(asset.id));
        return (
          <li key={asset.id}>
            <MediaCard
              aspect="square"
              selected={asset.id === selectedId}
              onClick={() => onSelect(asset)}
              ariaLabel={asset.filename}
              media={<AssetPreview projectId={projectId} asset={asset} />}
              overlay={
                badge && (
                  <StatusBadge
                    tone={badge.tone}
                    className={badge.ai ? AI_BADGE_CLASSNAME : undefined}
                  >
                    {badge.label}
                  </StatusBadge>
                )
              }
              title={asset.filename}
              subtitle={assetKindLabel(asset.kind)}
              meta={formatRelativeTime(asset.createdAt)}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function AssetGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading assets" className={GRID_CLASSNAME}>
      {Array.from({ length: count }, (_, index) => (
        <MediaCardSkeleton key={index} aspect="square" />
      ))}
    </div>
  );
}
