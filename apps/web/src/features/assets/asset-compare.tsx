'use client';

import { assetDifferences, type Asset, type Generation } from '@level-zero/domain';
import { Button, CompareView, type CompareSide } from '@level-zero/ui';

import { AssetInspectorPreview } from './asset-inspector-preview';
import { useAssetGeneration } from './use-assets';

/**
 * Two files from the same line of work, side by side.
 *
 * What separates them is `assetDifferences` — kind, format, dimensions, size,
 * variant, status, and the prompt, model, provider and seed behind anything
 * generated — so the comparison reports the same rows an entity version or a
 * tuning change does. The pair comes from the inspector's lineage list, which
 * is the only picker the data supports: assets do not version
 * (`docs/decisions/asset-library-model.md` §7).
 *
 * This writes nothing. It is a reading of two rows, and closing it leaves both
 * exactly as they were.
 */
export function AssetCompare({
  projectId,
  a,
  b,
  onClose,
}: {
  projectId: string;
  a: Asset;
  b: Asset;
  onClose: () => void;
}) {
  const generationA = useAssetGeneration(projectId, a.id);
  const generationB = useAssetGeneration(projectId, b.id);

  const groups = assetDifferences(
    { asset: a, generation: generationA.data ?? null },
    { asset: b, generation: generationB.data ?? null },
  );

  return (
    <CompareView
      a={side(projectId, a, generationA.data ?? null)}
      b={side(projectId, b, generationB.data ?? null)}
      groups={groups}
      sameLabel="These two files agree on everything recorded about them."
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-faint-foreground">
            Comparing two files. Nothing here changes either of them.
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back to the library
          </Button>
        </div>
      }
    />
  );
}

function side(projectId: string, asset: Asset, generation: Generation | null): CompareSide {
  return {
    label: asset.filename,
    meta: generation ? `Generated · ${generation.model ?? generation.capability}` : 'Imported',
    children: (
      <div className="flex flex-col gap-3">
        <AssetInspectorPreview projectId={projectId} asset={asset} />
        {generation && <p className="text-sm text-muted-foreground">{generation.prompt}</p>}
      </div>
    ),
  };
}
