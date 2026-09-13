import * as React from 'react';

import { cn } from './cn';

/**
 * The aspect ratios spec section 13 names, one per kind of subject —
 * characters, locations, assets, project cards, environment cards. Kept a
 * closed set rather than an arbitrary ratio prop: "avoid arbitrary image
 * ratios within the same card collection" is the spec's own rule.
 */
export type MediaCardAspect = 'square' | 'portrait' | 'video' | 'landscape';

const ASPECT_CLASSES: Record<MediaCardAspect, string> = {
  square: 'aspect-square', // 1:1 — assets
  portrait: 'aspect-[4/5]', // characters
  video: 'aspect-video', // 16:9 — locations, project cards
  landscape: 'aspect-[3/2]', // environment cards
};

export interface MediaCardProps {
  aspect?: MediaCardAspect;
  /** The image area's content: an `<img>` when there is one, a placeholder otherwise. */
  media: React.ReactNode;
  /** Rendered over the media's bottom-left corner — a status pill. */
  overlay?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Rendered under the title/subtitle block — a relative time, a short metric line. */
  meta?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * The reusable media card (design spec section 13): an image, then title,
 * subtitle and metadata underneath. Used for anything the workspace shows as
 * a visual tile rather than a row — generated assets first (issue #171),
 * with characters, locations and project cards as the other named uses.
 */
export function MediaCard({
  aspect = 'square',
  media,
  overlay,
  title,
  subtitle,
  meta,
  selected,
  onClick,
  className,
  ariaLabel,
}: MediaCardProps) {
  const sharedClassName = cn(
    'group w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors duration-150',
    onClick && 'cursor-pointer hover:border-border-strong hover:bg-hover',
    selected && 'border-primary ring-1 ring-[var(--lz-blue-muted)] hover:border-primary',
    className,
  );

  const content = (
    <>
      <div className={cn('relative overflow-hidden bg-raised', ASPECT_CLASSES[aspect])}>
        {media}
        {overlay && <div className="absolute bottom-2 left-2">{overlay}</div>}
      </div>
      <div className="p-3">
        <p className="truncate text-[13px] font-medium text-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-faint-foreground">{subtitle}</p>}
        {meta && <p className="mt-2 text-xs text-faint-foreground">{meta}</p>}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className={sharedClassName} aria-label={ariaLabel}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={sharedClassName}
    >
      {content}
    </button>
  );
}

/**
 * The loading placeholder for a `MediaCard` (spec section 42) — same
 * proportions as the real card so a grid never reflows as it loads.
 */
export function MediaCardSkeleton({
  aspect = 'square',
  className,
}: {
  aspect?: MediaCardAspect;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
    >
      <div className={cn('bg-raised', ASPECT_CLASSES[aspect])} />
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 rounded bg-raised" />
        <div className="h-3 w-1/3 rounded bg-raised" />
      </div>
    </div>
  );
}
