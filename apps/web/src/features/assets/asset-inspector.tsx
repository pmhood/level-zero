'use client';

import {
  ASSET_PIPELINE_STAGES,
  type Asset,
  type AssetPipelineStage,
  type AssetSummary,
} from '@level-zero/domain';
import {
  Button,
  Field,
  HistoryIcon,
  Inspector,
  Select,
  SparklesIcon,
  StatusBadge,
  Tabs,
  type TabItem,
} from '@level-zero/ui';
import { useState } from 'react';

import { GenerationPanel } from '@/features/generation/generation-panel';
import { apiErrorMessage, assetContentUrl, assetDownloadUrl } from '@/lib/api';

import { AssetHistory } from './asset-history';
import { AssetInspectorPreview } from './asset-inspector-preview';
import { AssetOverview } from './asset-overview';
import { assetKindLabel, assetPipelineStageLabel, assetStatusBadge } from './asset-presentation';
import { AssetProvenance } from './asset-provenance';
import { AssetReview } from './asset-review';
import { AssetUsage } from './asset-usage';
import { useArchiveAsset, useRestoreAsset, useSetAssetPipelineStage } from './use-assets';

/** The AI-purple treatment for the "Generated" pill — purple is for AI/generative only. */
const AI_BADGE_CLASSNAME =
  'border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground';

/**
 * The mockup's fifth tab, Versions, is deliberately absent: assets have no
 * version model, and its `v2.1` is lineage drawn as a number
 * (`docs/decisions/asset-library-model.md` §7). The lineage it stands for is
 * real and lives in History.
 */
const TABS: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'usage', label: 'Usage' },
  { value: 'generation', label: 'Generation' },
  { value: 'history', label: 'History' },
];

type InspectorTab = 'overview' | 'usage' | 'generation' | 'history';

/**
 * What can I do with the file I have selected (spec section 21): what it is,
 * where it came from, who uses it, what has been decided about it — and the
 * handful of actions the project can actually carry out on it today.
 *
 * Every action here is wired to infrastructure that exists. Delete is not
 * offered because assets archive and restore instead. The generative action
 * is the only purple one: opening, downloading, deciding, changing stage and
 * archiving are ordinary interaction, in `--lz-blue`.
 */
export function AssetInspector({
  projectId,
  asset,
  summary,
  onClose,
  onCompare,
}: {
  projectId: string;
  asset: Asset;
  /** The joined read model's row for this asset, when the page has loaded it. */
  summary: AssetSummary | undefined;
  onClose: () => void;
  /** Opens another file beside this one. */
  onCompare: (other: Asset) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const [varying, setVarying] = useState(false);

  const archive = useArchiveAsset(projectId);
  const restore = useRestoreAsset(projectId);
  const setStage = useSetAssetPipelineStage(projectId);

  const archived = asset.status === 'archived';
  const badge = assetStatusBadge(asset, summary);
  const error = archive.error ?? restore.error ?? setStage.error;

  return (
    <Inspector
      key={asset.id}
      title={asset.filename}
      description={assetKindLabel(asset.kind)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <AssetInspectorPreview projectId={projectId} asset={asset} />

        {badge && (
          <div>
            <StatusBadge tone={badge.tone} className={badge.ai ? AI_BADGE_CLASSNAME : undefined}>
              {badge.label}
            </StatusBadge>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button asChild variant="secondary" size="sm">
            <a href={assetContentUrl(projectId, asset.id)} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={assetDownloadUrl(projectId, asset.id)}>Download</a>
          </Button>

          {!archived && asset.mimeType.startsWith('image/') && (
            <Button
              variant="ai"
              size="sm"
              aria-pressed={varying}
              onClick={() => setVarying((current) => !current)}
            >
              <SparklesIcon className="size-4" />
              Variations
            </Button>
          )}

          {archived ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate(asset.id)}
            >
              <HistoryIcon className="size-4" />
              Restore
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              disabled={archive.isPending}
              onClick={() => archive.mutate(asset.id)}
            >
              Archive
            </Button>
          )}
        </div>

        <Field label="Pipeline stage" htmlFor="asset-pipeline-stage" className="max-w-40">
          <Select
            id="asset-pipeline-stage"
            value={asset.pipelineStage}
            disabled={setStage.isPending}
            onChange={(event) =>
              setStage.mutate({
                assetId: asset.id,
                stage: event.target.value as AssetPipelineStage,
              })
            }
          >
            {ASSET_PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {assetPipelineStageLabel(stage)}
              </option>
            ))}
          </Select>
        </Field>

        {error != null && (
          <p className="text-xs text-error">
            {apiErrorMessage(error, 'Could not change that file.')}
          </p>
        )}

        {varying && (
          <GenerationPanel
            projectId={projectId}
            referenceAssets={[asset]}
            presets={[
              {
                label: 'Vary this image',
                mode: 'variation',
                prompt: `another direction for ${asset.filename}`,
              },
            ]}
          />
        )}

        {archived ? (
          <p className="text-xs text-faint-foreground">
            This file is archived. Restore it to record decisions about it; everything already
            decided is still in History.
          </p>
        ) : (
          <AssetReview
            projectId={projectId}
            asset={asset}
            linkedEntities={summary?.linkedEntities.entities ?? []}
          />
        )}

        <Tabs items={TABS} value={tab} onChange={(value) => setTab(value as InspectorTab)} />

        {tab === 'overview' && (
          <AssetOverview projectId={projectId} asset={asset} summary={summary} />
        )}
        {tab === 'usage' && <AssetUsage projectId={projectId} summary={summary} />}
        {tab === 'generation' && (
          <AssetProvenance projectId={projectId} asset={asset} summary={summary} />
        )}
        {tab === 'history' && (
          <AssetHistory projectId={projectId} asset={asset} onCompare={onCompare} />
        )}
      </div>
    </Inspector>
  );
}
