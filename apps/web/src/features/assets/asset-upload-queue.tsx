'use client';

import { Button, CloseIcon, Panel, StatusBadge, type StatusTone } from '@level-zero/ui';

import { formatByteSize } from './asset-presentation';
import type { UploadItem, UploadStatus } from './use-asset-upload';

const STATUS_BADGE: Record<UploadStatus, { tone: StatusTone; label: string }> = {
  queued: { tone: 'neutral', label: 'Queued' },
  uploading: { tone: 'neutral', label: 'Uploading' },
  done: { tone: 'success', label: 'Uploaded' },
  failed: { tone: 'error', label: 'Failed' },
};

export interface AssetUploadQueueProps {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}

/**
 * The upload queue (issue #174): one row per file with its own status,
 * progress and error, so a batch of uploads never reads as a single
 * pass/fail outcome. Sits above the grid/list, not inside the toolbar or the
 * inspector — this only ever shows uploads in flight or recently finished.
 */
export function AssetUploadQueue({ items, onRetry, onDismiss }: AssetUploadQueueProps) {
  if (items.length === 0) return null;

  return (
    <Panel className="shrink-0 overflow-hidden">
      <header className="border-b border-border-subtle px-4 py-2.5">
        <h2 className="text-xs font-semibold text-faint-foreground uppercase">Uploads</h2>
      </header>
      <ul role="list" aria-label="Uploads" className="divide-y divide-border-subtle">
        {items.map((item) => (
          <AssetUploadRow key={item.id} item={item} onRetry={onRetry} onDismiss={onDismiss} />
        ))}
      </ul>
    </Panel>
  );
}

function AssetUploadRow({
  item,
  onRetry,
  onDismiss,
}: {
  item: UploadItem;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const badge = STATUS_BADGE[item.status];

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{item.file.name}</p>
          <span className="shrink-0 text-xs text-faint-foreground">
            {formatByteSize(item.file.size)}
          </span>
        </div>
        {item.status === 'uploading' && (
          <div
            role="progressbar"
            aria-label={`Uploading ${item.file.name}`}
            aria-valuenow={Math.round(item.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hover"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
        {item.status === 'failed' && item.error && (
          <p className="mt-1 text-xs text-error">{item.error}</p>
        )}
      </div>

      <StatusBadge tone={badge.tone} className="shrink-0">
        {badge.label}
      </StatusBadge>

      {item.status === 'failed' && (
        <Button size="sm" variant="secondary" onClick={() => onRetry(item.id)}>
          Retry
        </Button>
      )}

      <Button
        size="icon"
        variant="ghost"
        aria-label={`Dismiss ${item.file.name}`}
        onClick={() => onDismiss(item.id)}
      >
        <CloseIcon className="size-4" />
      </Button>
    </li>
  );
}
