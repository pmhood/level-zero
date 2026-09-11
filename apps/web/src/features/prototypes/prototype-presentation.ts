import type { PlaytestStatus, PrototypeVersionStatus } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

export interface PresentedStatus {
  tone: StatusTone;
  label: string;
}

/**
 * How far along a prototype version is (`packages/domain/src/prototype/prototype-version.ts`):
 * `draft` is still being assembled, `playable` is one someone can actually
 * run, `archived` is no longer worth playing.
 */
export function prototypeVersionStatusBadge(status: PrototypeVersionStatus): PresentedStatus {
  switch (status) {
    case 'playable':
      return { tone: 'success', label: 'Playable' };
    case 'archived':
      return { tone: 'neutral', label: 'Archived' };
    case 'draft':
      return { tone: 'neutral', label: 'Draft' };
  }
}

export function playtestStatusBadge(status: PlaytestStatus): PresentedStatus {
  switch (status) {
    case 'running':
      return { tone: 'warning', label: 'Running' };
    case 'complete':
      return { tone: 'success', label: 'Complete' };
    case 'cancelled':
      return { tone: 'neutral', label: 'Cancelled' };
    case 'planned':
      return { tone: 'neutral', label: 'Planned' };
  }
}

/** A plain byte count as a reader sees it — the build artifact panel's only use of one. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
