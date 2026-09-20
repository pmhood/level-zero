'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';
import type { Route } from 'next';
import Link from 'next/link';

import { entityRoute } from '@/features/entity-detail/entity-route';

import { PropertyRow } from './asset-property-row';
import {
  assetKindLabel,
  assetPipelineStageLabel,
  assetStatusBadge,
  formatByteSize,
  formatDate,
  formatDimensionsOrDuration,
} from './asset-presentation';
import { useAssetGeneration } from './use-assets';

/**
 * What this file is: the facts on the row itself, who uses it, and — where a
 * generation produced it — the model and the prompt that did.
 *
 * The mockup's Version, Collection and Tags rows are left out rather than
 * faked: assets have no version model and no tags column
 * (`docs/decisions/asset-library-model.md` §5, §7), and collections are #178.
 */
export function AssetOverview({
  projectId,
  asset,
  summary,
}: {
  projectId: string;
  asset: Asset;
  summary: AssetSummary | undefined;
}) {
  const generation = useAssetGeneration(projectId, asset.id);
  const generated = summary?.origin === 'generated';
  const model = summary?.generation?.model ?? generation.data?.model ?? null;
  const badge = assetStatusBadge(asset, summary);

  return (
    <dl className="flex flex-col gap-2 text-xs">
      <PropertyRow label="Type">
        {assetKindLabel(asset.kind)} · {asset.mimeType}
      </PropertyRow>
      <PropertyRow label="Status">{badge?.label ?? 'Active'}</PropertyRow>
      <PropertyRow label="Stage">{assetPipelineStageLabel(asset.pipelineStage)}</PropertyRow>
      <PropertyRow label="Size">{formatByteSize(asset.byteSize)}</PropertyRow>
      <PropertyRow label="Dimensions">{formatDimensionsOrDuration(asset)}</PropertyRow>
      <PropertyRow label="Added">{formatDate(asset.createdAt)}</PropertyRow>
      <PropertyRow label="Used by">
        <UsedBy projectId={projectId} summary={summary} />
      </PropertyRow>
      <PropertyRow label="Source">{generated ? 'AI generated' : 'Imported'}</PropertyRow>
      {generated && model && <PropertyRow label="Model">{model}</PropertyRow>}
      {generated && generation.data && (
        <PropertyRow label="Prompt">
          <span className="text-foreground">{generation.data.prompt}</span>
        </PropertyRow>
      )}
    </dl>
  );
}

/**
 * The first few entities that reference this file, each opening its canonical
 * route. The summary caps the list (#202), so the count says how much of it is
 * being shown; the Usage tab is where the rest reads.
 */
function UsedBy({ projectId, summary }: { projectId: string; summary: AssetSummary | undefined }) {
  const linked = summary?.linkedEntities;
  if (!linked || linked.total === 0) return <>Nothing links to this file yet</>;

  const hidden = linked.total - linked.entities.length;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      {linked.entities.map((entity) => (
        <Link
          key={entity.entityId}
          href={entityRoute(projectId, entity.entityId) as Route}
          className="text-primary hover:underline"
        >
          {entity.name}
        </Link>
      ))}
      {hidden > 0 && <span>+{hidden}</span>}
    </span>
  );
}
