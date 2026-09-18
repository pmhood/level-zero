'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';
import { MediaCard, MediaCardSkeleton, StatusBadge } from '@level-zero/ui';

import type { AssetClickModifiers } from './use-asset-selection';
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
  /** Omit for a read-only grid (the Collections view, #227) — every tile renders unselectable and inert. */
  isSelected?: (id: string) => boolean;
  onClick?: (index: number, modifiers: AssetClickModifiers) => void;
}

/**
 * The grid presentation (issue #171): one `MediaCard` per asset, 1:1 per
 * spec section 13's ratio table, a status pill from #170's summary and a
 * type-appropriate preview for anything that is not a loadable image.
 *
 * Multi-select (#175) reuses the same tile click `MediaCard` already had —
 * plain click, shift-click and cmd/ctrl-click all read off the same
 * `MouseEvent` the browser hands the button, so the grid needed no second
 * click target for a selection checkbox the way the list's rows do.
 */
export function AssetGrid({ projectId, assets, summaries, isSelected, onClick }: AssetGridProps) {
  return (
    <ul role="list" aria-label="Assets" className={GRID_CLASSNAME}>
      {assets.map((asset, index) => {
        const summary = summaries.get(asset.id);
        const badge = assetStatusBadge(asset, summary);
        return (
          <li key={asset.id}>
            <MediaCard
              aspect="square"
              selected={isSelected?.(asset.id)}
              onClick={
                onClick
                  ? (event) =>
                      onClick(index, {
                        shiftKey: event.shiftKey,
                        metaKey: event.metaKey,
                        ctrlKey: event.ctrlKey,
                      })
                  : undefined
              }
              ariaLabel={asset.filename}
              media={<AssetPreview projectId={projectId} asset={asset} summary={summary} />}
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
