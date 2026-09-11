'use client';

import type { Asset, AssetSelectionContext, Generation } from '@level-zero/domain';
import { Button, HistoryIcon, Panel, SparklesIcon, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { AssetDecisionHistory } from '@/features/selection/asset-decision-history';
import {
  AssetSelectionActions,
  AssetSelectionBadges,
} from '@/features/selection/asset-selection-actions';
import { apiErrorMessage, assetContentUrl } from '@/lib/api';

import { GenerationProvenanceDetails } from './generation-provenance';
import { useGenerationResults } from './use-generation';

export interface GenerationResultsProps {
  projectId: string;
  generation: Generation;
  /** Starts a variation from one result. */
  onExploreVariations: (asset: Asset) => void;
  /** What this workspace does with a result the user keeps. */
  onUseResult?: (asset: Asset) => void;
  useResultLabel?: string;
  /**
   * What a result would be chosen for. Given one, each tile carries the triage
   * actions — favourite, shortlist, approve, reject — so a wall of output can be
   * cut down where it is looked at.
   */
  selectionContext?: AssetSelectionContext;
  /** True where the purpose holds one visual, so approving supersedes. */
  replaceCurrentSelection?: boolean;
}

/**
 * What a finished generation produced, and what can be done with it.
 *
 * The tiles are ordinary project assets — the generation only points at them —
 * so keeping one is a link, never a copy, and exploring variations from one
 * starts a fresh generation that leaves it exactly as it is.
 */
export function GenerationResults({
  projectId,
  generation,
  onExploreVariations,
  onUseResult,
  useResultLabel = 'Use this result',
  selectionContext,
  replaceCurrentSelection = false,
}: GenerationResultsProps) {
  const results = useGenerationResults(projectId, generation.outputAssetIds);
  const [provenanceFor, setProvenanceFor] = useState<string | null>(null);

  if (generation.outputAssetIds.length === 0) return null;

  if (results.isPending) {
    return <p className="text-xs text-faint-foreground">Loading results…</p>;
  }

  if (results.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(results.error, 'Could not load the results.')}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {results.data.map((asset) => (
        <li key={asset.id}>
          <Panel className="overflow-hidden">
            {/* 1:1, the ratio the spec gives asset imagery (section 13). */}
            <div className="flex aspect-square items-center justify-center bg-raised">
              <img
                src={assetContentUrl(projectId, asset.id)}
                alt={asset.filename}
                className="size-full object-cover"
              />
            </div>

            <div className="flex flex-col gap-2 p-3">
              <div>
                <p className="truncate text-[13px] font-medium text-foreground">{asset.filename}</p>
                <p className="mt-0.5 text-xs text-faint-foreground">
                  {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.mimeType}
                </p>
              </div>

              {selectionContext && (
                <AssetSelectionBadges
                  projectId={projectId}
                  asset={asset}
                  context={selectionContext}
                />
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Tag>Generated</Tag>
                {onUseResult && (
                  <Button variant="secondary" size="sm" onClick={() => onUseResult(asset)}>
                    {useResultLabel}
                  </Button>
                )}
                <Button variant="ai" size="sm" onClick={() => onExploreVariations(asset)}>
                  <SparklesIcon className="size-4" />
                  Variations
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Provenance for ${asset.filename}`}
                  onClick={() =>
                    setProvenanceFor((current) => (current === asset.id ? null : asset.id))
                  }
                >
                  <HistoryIcon className="size-4" />
                </Button>
              </div>

              {selectionContext && (
                <AssetSelectionActions
                  projectId={projectId}
                  asset={asset}
                  context={selectionContext}
                  replaceCurrent={replaceCurrentSelection}
                />
              )}

              {provenanceFor === asset.id && (
                <div className="flex flex-col gap-3">
                  <GenerationProvenanceDetails projectId={projectId} generation={generation} />
                  {/* Where it came from, and what has been decided about it —
                      including the purposes it was turned down for. */}
                  <AssetDecisionHistory projectId={projectId} assetId={asset.id} />
                </div>
              )}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
