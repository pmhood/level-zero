'use client';

import type { Asset } from '@level-zero/domain';
import { Button } from '@level-zero/ui';

import { AssetDecisionHistory } from '@/features/selection/asset-decision-history';
import { useAssetSelectionHistory } from '@/features/selection/use-selection';
import { apiErrorMessage } from '@/lib/api';

import { assetKindLabel } from './asset-presentation';
import { useAssetGeneration, useAssetLineage, type AssetRelation } from './use-assets';

/** What each lineage relation is, said as a relation and never as a version. */
const RELATION_LABELS: Record<AssetRelation, string> = {
  source: 'Derived from',
  derivative: 'Derived from this',
  reroll: 'Another take',
};

/**
 * Everything that has happened to this file: what was decided about it, in
 * which context, and the other files on the same line of work.
 *
 * The decisions come from the asset side rather than an entity's, so a concept
 * turned down as a portrait and kept as costume exploration shows both rows.
 * The files come from the three lineages assets actually have — a derivative,
 * the source it derives from, and the other takes around a generation — none
 * of which is a version chain, so none of them is numbered like one.
 */
export function AssetHistory({
  projectId,
  asset,
  onCompare,
}: {
  projectId: string;
  asset: Asset;
  /** Opens this file beside the selected one. */
  onCompare: (other: Asset) => void;
}) {
  const decisions = useAssetSelectionHistory(projectId, asset.id);
  const generation = useAssetGeneration(projectId, asset.id);
  const lineage = useAssetLineage(projectId, asset, generation.data ?? null);

  return (
    <div className="flex flex-col gap-4">
      <AssetDecisionHistory projectId={projectId} assetId={asset.id} />
      {decisions.data?.length === 0 && (
        <p className="text-xs text-faint-foreground">
          Nothing has been decided about this file yet.
        </p>
      )}

      <section aria-label="Related files" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-foreground">Related files</h4>

        {lineage.isPending && <p className="text-xs text-faint-foreground">Reading lineage…</p>}

        {lineage.isError && (
          <p className="text-xs text-error">
            {apiErrorMessage(lineage.error, 'Could not read what this file came from.')}
          </p>
        )}

        {lineage.data?.length === 0 && (
          <p className="text-xs text-faint-foreground">
            Nothing was derived from this file, and no other takes exist.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {(lineage.data ?? []).map((relative) => (
            <li
              key={`${relative.relation}:${relative.asset.id}`}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{relative.asset.filename}</p>
                <p className="text-xs text-faint-foreground">
                  {RELATION_LABELS[relative.relation]} · {assetKindLabel(relative.asset.kind)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Compare with ${relative.asset.filename}`}
                onClick={() => onCompare(relative.asset)}
              >
                Compare
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
