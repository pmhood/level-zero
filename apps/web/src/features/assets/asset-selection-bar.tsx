'use client';

import type { Asset, AssetMarkKind, AssetSummary } from '@level-zero/domain';
import { Button, CloseIcon, StarIcon } from '@level-zero/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ACTING_AS } from '@/features/review/review';
import * as api from '@/lib/api';

import { assetKeys } from './use-assets';
import { useBulkAssetAction, type BulkActionFailure } from './use-bulk-asset-action';

export interface AssetSelectionBarProps {
  projectId: string;
  /** The loaded assets the selection currently resolves to, in no particular order. */
  selectedAssets: readonly Asset[];
  summaries: ReadonlyMap<string, AssetSummary>;
  onClear: () => void;
  /** A bulk action's partial failure: narrows the selection to just the ids it names. */
  onNarrowSelection: (ids: readonly string[]) => void;
}

/**
 * The bar above the grid/list once more than one asset is selected (issue
 * #175): the count, and the bulk actions that already have a single-asset
 * path to build on — favorite/shortlist marks and archive/restore. No bulk
 * approval, generation or delete: those are the issue's own settled scope
 * decisions, not omissions.
 *
 * A mark toggle reads "on" only when every selected asset already carries
 * it, the same reading a select-all checkbox gives a partially-checked
 * group — click marks whatever is missing it, click again clears it from
 * all. Archive and Restore are `Button`s, not a matching toggle pair,
 * because a selection with a mix of both is the exception, not the
 * anchor case a toggle's binary state has to speak for.
 */
export function AssetSelectionBar({
  projectId,
  selectedAssets,
  summaries,
  onClear,
  onNarrowSelection,
}: AssetSelectionBarProps) {
  const queryClient = useQueryClient();
  const { run, isPending } = useBulkAssetAction();
  const [failures, setFailures] = useState<readonly BulkActionFailure[]>([]);

  const ids = selectedAssets.map((asset) => asset.id);
  const filenameById = new Map(selectedAssets.map((asset) => [asset.id, asset.filename]));
  const allArchived =
    selectedAssets.length > 0 && selectedAssets.every((asset) => asset.status === 'archived');

  async function bulkMark(kind: AssetMarkKind, marked: boolean) {
    const action = marked
      ? (assetId: string) => api.markAsset(projectId, { assetId, kind, actor: ACTING_AS })
      : (assetId: string) => api.unmarkAsset(projectId, assetId, kind);

    const result = await run(ids, action);
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'asset-marks'] });
    queryClient.invalidateQueries({ queryKey: assetKeys.all(projectId) });
    applyResult(result);
  }

  async function bulkArchive(archive: boolean) {
    const action = archive
      ? (assetId: string) => api.archiveAsset(projectId, assetId)
      : (assetId: string) => api.restoreAsset(projectId, assetId);

    const result = await run(ids, action);
    queryClient.invalidateQueries({ queryKey: assetKeys.all(projectId) });
    applyResult(result);
  }

  function applyResult(result: { succeededIds: string[]; failures: BulkActionFailure[] }) {
    setFailures(result.failures);
    // Everything that succeeded is done; keeping only the failures selected
    // is what makes pressing the same action again a retry of just those,
    // instead of re-failing on assets already in the state it asked for.
    if (result.failures.length > 0) onNarrowSelection(result.failures.map((f) => f.assetId));
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected assets"
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
    >
      <span className="text-sm font-medium text-foreground">{selectedAssets.length} selected</span>

      <div className="flex flex-wrap items-center gap-1.5">
        <MarkToggle
          kind="favorite"
          label="Favorite"
          selectedAssets={selectedAssets}
          summaries={summaries}
          disabled={isPending}
          onToggle={bulkMark}
        />
        <MarkToggle
          kind="shortlisted"
          label="Shortlist"
          selectedAssets={selectedAssets}
          summaries={summaries}
          disabled={isPending}
          onToggle={bulkMark}
        />

        {allArchived ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => bulkArchive(false)}
          >
            Restore
          </Button>
        ) : (
          <Button variant="danger" size="sm" disabled={isPending} onClick={() => bulkArchive(true)}>
            Archive
          </Button>
        )}
      </div>

      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <CloseIcon className="size-4" />
        Clear selection
      </Button>

      {failures.length > 0 && (
        <p role="alert" className="w-full text-xs text-error">
          Couldn&rsquo;t apply to {failures.length} {failures.length === 1 ? 'file' : 'files'}:{' '}
          {failures
            .map(
              (failure) =>
                `${filenameById.get(failure.assetId) ?? failure.assetId} (${failure.message})`,
            )
            .join(', ')}
          . The rest were applied — only these stayed selected, so trying again retries just them.
        </p>
      )}
    </div>
  );
}

function MarkToggle({
  kind,
  label,
  selectedAssets,
  summaries,
  disabled,
  onToggle,
}: {
  kind: AssetMarkKind;
  label: string;
  selectedAssets: readonly Asset[];
  summaries: ReadonlyMap<string, AssetSummary>;
  disabled: boolean;
  onToggle: (kind: AssetMarkKind, marked: boolean) => void;
}) {
  const allMarked =
    selectedAssets.length > 0 &&
    selectedAssets.every((asset) => summaries.get(asset.id)?.markKinds.includes(kind));

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={allMarked}
      disabled={disabled}
      onClick={() => onToggle(kind, !allMarked)}
    >
      {kind === 'favorite' && (
        <StarIcon className="size-4" fill={allMarked ? 'currentColor' : 'none'} />
      )}
      {allMarked ? `Un${label.toLowerCase()}` : label}
    </Button>
  );
}
