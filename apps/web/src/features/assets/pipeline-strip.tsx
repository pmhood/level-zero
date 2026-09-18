'use client';

import { ASSET_PIPELINE_STAGES, type AssetPipelineStage } from '@level-zero/domain';
import { Button, EmptyState, MediaCard, MediaCardSkeleton, SectionPanel } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';

import { apiErrorMessage, listAssetLibrary } from '@/lib/api';

import { assetPipelineStageLabel } from './asset-presentation';
import { AssetPreview } from './asset-preview';
import { useAssetPipelineStageCounts } from './use-assets';

export interface PipelineStripProps {
  projectId: string;
  selectedStage: AssetPipelineStage | null;
  onSelectStage: (stage: AssetPipelineStage) => void;
}

/**
 * The mockup's bottom strip (issue #230): #229's three stages, each with an
 * accurate, project-wide, server-side count and a representative thumbnail.
 * A click narrows the grid/list to that stage through the read model's
 * `pipelineStages` filter — the strip is a filter control over the library
 * it sits under, never a link to the Build workspace's own Asset Pipeline
 * (`docs/decisions/asset-library-model.md` §2.3/§6.3).
 *
 * Counts come from one grouped read (`useAssetPipelineStageCounts`), not one
 * `listAssetLibrary` call per stage — the same "agrees with the listing's
 * total" guarantee every other count in the library keeps, since both sides
 * apply the same active-source-asset rule.
 */
export function PipelineStrip({ projectId, selectedStage, onSelectStage }: PipelineStripProps) {
  const countsQuery = useAssetPipelineStageCounts(projectId);

  return (
    <SectionPanel
      title="Asset Pipeline"
      description="Track assets from concept to production ready."
    >
      {countsQuery.isPending ? (
        <ul
          role="status"
          aria-label="Loading pipeline stages"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {ASSET_PIPELINE_STAGES.map((stage) => (
            <li key={stage}>
              <MediaCardSkeleton aspect="square" />
            </li>
          ))}
        </ul>
      ) : countsQuery.error ? (
        <EmptyState
          title="Couldn't load the pipeline"
          description={apiErrorMessage(countsQuery.error)}
          actions={<Button onClick={() => void countsQuery.refetch()}>Try again</Button>}
        />
      ) : (
        <ul
          role="list"
          aria-label="Pipeline stages"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {ASSET_PIPELINE_STAGES.map((stage) => (
            <li key={stage}>
              <PipelineStageCard
                projectId={projectId}
                stage={stage}
                count={countsQuery.data?.[stage] ?? 0}
                selected={selectedStage === stage}
                onSelect={() => onSelectStage(stage)}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function stageAssetCountLabel(count: number): string {
  return `${count} asset${count === 1 ? '' : 's'}`;
}

/**
 * One stage's tile: the library, scoped to this stage alone and limited to
 * the single most recently updated asset — the representative thumbnail,
 * read through the same `listAssetLibrary` the grid calls rather than a
 * bespoke endpoint. Only fetched once the count confirms the stage has
 * something to show; a stage with no active assets renders honestly (issue
 * #230's acceptance criterion) instead of a broken image or an omitted card.
 */
function PipelineStageCard({
  projectId,
  stage,
  count,
  selected,
  onSelect,
}: {
  projectId: string;
  stage: AssetPipelineStage;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const representativeQuery = useQuery({
    queryKey: ['projects', projectId, 'assets', 'pipeline-stage-sample', stage],
    queryFn: () =>
      listAssetLibrary(projectId, {
        pipelineStages: [stage],
        sortBy: 'updatedAt',
        sortDirection: 'desc',
        limit: 1,
      }),
    enabled: Boolean(projectId) && count > 0,
  });
  const asset = representativeQuery.data?.items[0];
  const summary = representativeQuery.data?.summaries[0];

  return (
    <MediaCard
      aspect="square"
      selected={selected}
      onClick={onSelect}
      ariaLabel={`${assetPipelineStageLabel(stage)}: ${stageAssetCountLabel(count)}`}
      media={
        asset ? (
          <AssetPreview projectId={projectId} asset={asset} summary={summary} />
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-faint-foreground">
            No preview
          </div>
        )
      }
      title={assetPipelineStageLabel(stage)}
      subtitle={stageAssetCountLabel(count)}
    />
  );
}
