'use client';

import type { Asset, Generation } from '@level-zero/domain';
import { Button, HistoryIcon, Panel, SparklesIcon, Tag } from '@level-zero/ui';
import { useState } from 'react';

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

              {provenanceFor === asset.id && (
                <GenerationProvenanceDetails projectId={projectId} generation={generation} />
              )}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
