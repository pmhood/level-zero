import * as React from 'react';

import { cn } from './cn';

/**
 * The left-to-right scrim a cinematic header lays over its artwork, verbatim
 * from spec section 8: the canvas colour at near-opaque on the title side,
 * fading out across the band so the art still reads on the right.
 */
const CINEMATIC_SCRIM =
  'linear-gradient(90deg, rgba(8, 19, 28, 0.96) 0%, rgba(8, 19, 28, 0.66) 52%, rgba(8, 19, 28, 0.18) 100%)';

export interface WorkspaceHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Environment artwork for the cinematic header (spec section 8). Pass a URL
   * to render the taller banded header over it; leave it out for the compact
   * header. The art is decorative, so it is a CSS background rather than an
   * `<img>` and is never announced.
   */
  image?: string;
}

/**
 * The workspace header (spec section 8) in its two patterns. Without `image`
 * it is the compact header used by utility-heavy tool pages such as Idea Lab:
 * a title, one line of description, and actions. With `image` it is the
 * cinematic header the spec asks for on World, Overview, Mechanics, GDD, Build
 * and Prototype — the same three parts, at cinematic height over the artwork.
 *
 * The scrim is dark whatever the app theme is, so the text over it is pinned to
 * the palette's light ink rather than following `text-foreground`.
 */
export function WorkspaceHeader({ title, description, actions, image }: WorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 px-4 py-5 xl:px-5 2xl:px-6',
        image && 'min-h-[180px] bg-cover bg-center',
      )}
      style={image ? { backgroundImage: `${CINEMATIC_SCRIM}, url("${image}")` } : undefined}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            'text-[28px] leading-[34px] font-bold',
            image ? 'text-[var(--lz-text-primary)]' : 'text-foreground',
          )}
        >
          {title}
        </h1>
        {description && (
          <p
            className={cn(
              'mt-1 text-sm',
              image ? 'text-[var(--lz-text-secondary)]' : 'text-muted-foreground',
            )}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
