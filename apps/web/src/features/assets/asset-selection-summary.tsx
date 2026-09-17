'use client';

import type { Asset } from '@level-zero/domain';
import { Inspector } from '@level-zero/ui';

import { assetKindLabel, formatByteSize } from './asset-presentation';
import { PropertyRow } from './asset-property-row';

/**
 * What the inspector shows once more than one asset is selected (issue
 * #175): a summary of the selection, never one asset's own detail standing
 * in for the group — the bulk actions live in the selection bar above the
 * grid/list, so this is read-only.
 */
export function AssetSelectionSummary({
  assets,
  onClose,
}: {
  assets: readonly Asset[];
  onClose: () => void;
}) {
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byteSize, 0);
  const kindCounts = new Map<string, number>();
  for (const asset of assets) {
    kindCounts.set(asset.kind, (kindCounts.get(asset.kind) ?? 0) + 1);
  }

  return (
    <Inspector
      title={`${assets.length} assets selected`}
      description="Selection summary"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2 text-xs">
          <PropertyRow label="Kinds">
            {[...kindCounts.entries()]
              .map(([kind, count]) => `${count} ${assetKindLabel(kind as Asset['kind'])}`)
              .join(', ')}
          </PropertyRow>
          <PropertyRow label="Total size">{formatByteSize(totalBytes)}</PropertyRow>
        </dl>

        <ul role="list" aria-label="Selected files" className="flex flex-col gap-1 text-xs">
          {assets.map((asset) => (
            <li key={asset.id} className="truncate text-foreground">
              {asset.filename}
            </li>
          ))}
        </ul>
      </div>
    </Inspector>
  );
}
