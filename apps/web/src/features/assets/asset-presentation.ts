import type { Asset, AssetKind, AssetPipelineStage, AssetSummary } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  model_3d: '3D Model',
  reference: 'Reference',
  export: 'Export',
  build_artifact: 'Build Artifact',
};

export function assetKindLabel(kind: AssetKind): string {
  return ASSET_KIND_LABELS[kind];
}

/**
 * The Level Zero name for each of #229's three stages
 * (`docs/decisions/asset-library-model.md` §6.3). `production_ready` is the
 * same stage as the Build workspace's "Engine Ready" — one vocabulary, not
 * two, so the Assets workspace never shows that second name.
 */
const ASSET_PIPELINE_STAGE_LABELS: Record<AssetPipelineStage, string> = {
  concept: 'Concept',
  in_progress: 'In Progress',
  production_ready: 'Production Ready',
};

export function assetPipelineStageLabel(stage: AssetPipelineStage): string {
  return ASSET_PIPELINE_STAGE_LABELS[stage];
}

export interface AssetBadge {
  tone: StatusTone;
  label: string;
  /** True for the AI-purple treatment — spec: purple is reserved for AI/generative actions. */
  ai?: boolean;
}

/**
 * The single badge slot on an asset tile/row, filled by precedence
 * (`docs/decisions/asset-library-model.md` §6.5): archived beats every
 * derived state, then a current approval, then generation origin, then the
 * reference kind. Production Ready, In Progress and Concept need the
 * pipeline stage #177 adds and are left out until it lands — rendering none
 * of them is the documented answer, not an omission.
 */
export function assetStatusBadge(
  asset: Asset,
  summary: AssetSummary | undefined,
): AssetBadge | null {
  if (asset.status === 'archived') return { tone: 'neutral', label: 'Archived' };
  if (summary?.approved) return { tone: 'success', label: 'Approved' };
  if (summary?.origin === 'generated') return { tone: 'neutral', label: 'Generated', ai: true };
  if (asset.kind === 'reference') return { tone: 'neutral', label: 'Reference' };
  return null;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** A plain byte count as a reader sees it. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

export function formatDimensions(width: number | null, height: number | null): string | null {
  if (width == null || height == null) return null;
  return `${width} × ${height}`;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/** The list view's "dimensions or duration" column: whichever fact this kind of file actually has. */
export function formatDimensionsOrDuration(asset: Asset): string {
  return (
    formatDimensions(asset.width, asset.height) ?? formatDuration(asset.durationSeconds) ?? '—'
  );
}

/** A plain calendar date, for the list view's "created" column. */
export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const RELATIVE_TIME_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 minutes ago" style label for a grid tile's timestamp. */
export function formatRelativeTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const magnitude = Math.abs(seconds);

  for (const [unit, unitSeconds] of RELATIVE_TIME_UNITS) {
    if (magnitude >= unitSeconds) {
      return relativeTimeFormatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return 'just now';
}
