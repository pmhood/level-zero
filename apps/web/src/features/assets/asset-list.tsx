'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';
import {
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@level-zero/ui';

import {
  assetKindLabel,
  assetStatusBadge,
  formatByteSize,
  formatDate,
  formatDimensionsOrDuration,
} from './asset-presentation';

/** The AI-purple treatment for the "Generated" pill — spec: purple is reserved for AI/generative actions. */
const AI_BADGE_CLASSNAME =
  'border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground';

export interface AssetListProps {
  assets: Asset[];
  summaries: ReadonlyMap<string, AssetSummary>;
  selectedId: string | null;
  onSelect: (asset: Asset) => void;
}

/**
 * The list presentation (issue #171): everything the grid's tiles cannot
 * show well — filename, kind, MIME type, size, dimensions or duration,
 * created date, and the same badge column the grid uses. Design spec
 * section 40's table, built once in `packages/ui` rather than inline here.
 */
export function AssetList({ assets, summaries, selectedId, onSelect }: AssetListProps) {
  return (
    <Table aria-label="Assets">
      <TableHeader>
        <TableRow>
          <TableHead>Filename</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>MIME type</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Dimensions / duration</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => {
          const badge = assetStatusBadge(asset, summaries.get(asset.id));
          return (
            <TableRow
              key={asset.id}
              selected={asset.id === selectedId}
              onClick={() => onSelect(asset)}
            >
              <TableCell className="font-medium text-foreground">{asset.filename}</TableCell>
              <TableCell>{assetKindLabel(asset.kind)}</TableCell>
              <TableCell className="text-muted-foreground">{asset.mimeType}</TableCell>
              <TableCell>{formatByteSize(asset.byteSize)}</TableCell>
              <TableCell>{formatDimensionsOrDuration(asset)}</TableCell>
              <TableCell>{formatDate(asset.createdAt)}</TableCell>
              <TableCell>
                {badge ? (
                  <StatusBadge
                    tone={badge.tone}
                    className={badge.ai ? AI_BADGE_CLASSNAME : undefined}
                  >
                    {badge.label}
                  </StatusBadge>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const SKELETON_ROW_WIDTHS = ['w-40', 'w-16', 'w-24', 'w-14', 'w-20', 'w-20', 'w-16'];

export function AssetListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading assets"
      className="animate-pulse overflow-hidden rounded-lg border border-border"
    >
      <table className="w-full border-collapse text-left text-sm">
        <tbody className="divide-y divide-border-subtle">
          {Array.from({ length: count }, (_, row) => (
            <tr key={row} className="h-9">
              {SKELETON_ROW_WIDTHS.map((width, cell) => (
                <td key={cell} className="px-3 py-2">
                  <div className={`h-3 rounded bg-raised ${width}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
