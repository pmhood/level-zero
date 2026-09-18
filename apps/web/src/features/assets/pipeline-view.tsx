'use client';

import { ASSET_PIPELINE_STAGES, type AssetPipelineStage } from '@level-zero/domain';
import { Button, EmptyState, SectionPanel } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';

import { apiErrorMessage, listAssetLibrary, type ListAssetLibraryParams } from '@/lib/api';

import { AssetGrid, AssetGridSkeleton } from './asset-grid';
import { assetPipelineStageLabel } from './asset-presentation';

/** A peek at each stage, not a fully paginated listing — "View in Grid" is the way to see the rest. */
const PIPELINE_VIEW_GROUP_LIMIT = 12;

export interface PipelineViewProps {
  projectId: string;
  /** #171/#172's toolbar filters, translated — every one keeps working, grouped by stage instead of flattened. */
  listParams: ListAssetLibraryParams;
  onDrillIntoStage: (stage: AssetPipelineStage) => void;
}

/**
 * The switcher's fourth position (issue #230, #171's reserved slot): the
 * same library, grouped into #229's three stages instead of one flat page.
 *
 * Read-only, like the strip — advancing an asset's stage is a separate
 * issue — so a tile here drills into the Grid view filtered to its stage
 * (`onDrillIntoStage`, the same "clicking a stage filters" affordance the
 * strip has) rather than opening the inspector in place.
 */
export function PipelineView({ projectId, listParams, onDrillIntoStage }: PipelineViewProps) {
  return (
    <div className="flex flex-col gap-4">
      {ASSET_PIPELINE_STAGES.map((stage) => (
        <PipelineStageGroup
          key={stage}
          projectId={projectId}
          stage={stage}
          listParams={listParams}
          onDrillIntoStage={onDrillIntoStage}
        />
      ))}
    </div>
  );
}

function PipelineStageGroup({
  projectId,
  stage,
  listParams,
  onDrillIntoStage,
}: {
  projectId: string;
  stage: AssetPipelineStage;
  listParams: ListAssetLibraryParams;
  onDrillIntoStage: (stage: AssetPipelineStage) => void;
}) {
  const query = useQuery({
    queryKey: ['projects', projectId, 'assets', 'library', 'pipeline-group', stage, listParams],
    queryFn: () =>
      listAssetLibrary(projectId, {
        ...listParams,
        pipelineStages: [stage],
        limit: PIPELINE_VIEW_GROUP_LIMIT,
      }),
    enabled: Boolean(projectId),
  });

  const total = query.data?.total ?? 0;
  const drillIn = () => onDrillIntoStage(stage);

  return (
    <SectionPanel
      title={assetPipelineStageLabel(stage)}
      description={query.isPending ? undefined : `${total} asset${total === 1 ? '' : 's'}`}
      actions={
        total > 0 && (
          <Button variant="ghost" size="sm" onClick={drillIn}>
            View in Grid
          </Button>
        )
      }
    >
      {query.isPending ? (
        <AssetGridSkeleton count={PIPELINE_VIEW_GROUP_LIMIT} />
      ) : query.error ? (
        <EmptyState
          title="Couldn't load this stage"
          description={apiErrorMessage(query.error)}
          actions={<Button onClick={() => void query.refetch()}>Try again</Button>}
        />
      ) : total === 0 ? (
        <EmptyState
          title="No assets in this stage yet"
          description="Nothing in the project is at this stage right now."
        />
      ) : (
        <AssetGrid
          projectId={projectId}
          assets={query.data!.items}
          summaries={
            new Map(
              query.data!.items.map((asset, index) => [asset.id, query.data!.summaries[index]!]),
            )
          }
          isSelected={() => false}
          onClick={drillIn}
        />
      )}
    </SectionPanel>
  );
}
