import type { SVGProps } from 'react';

/**
 * Icons the Assets workspace needs: the Assets view switcher's slots for
 * #178 (Collections) and #179 (Pipeline) — not views of their own yet, just
 * labelled, disabled slots the switcher reserves (issue #171) — plus the
 * upload button's icon (#174). Drawn from the design package's own set
 * (`assets/icons/*.svg`), 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local until a second workspace wants them, matching
 * `character-icons.tsx`'s convention.
 */
function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    viewBox: '0 0 24 24',
    width: 24,
    height: 24,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

/** `assets/icons/inventory.svg` */
export function CollectionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <path d="M9 6V4h6v2M8 11h8M8 15h5" />
    </svg>
  );
}

/** `assets/icons/deploy.svg` */
export function PipelineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 4c3 0 5.8 1.3 7 3.5-1.2 3.7-4 6.5-7.7 7.7L9 19.5 4.5 15l4.3-4.3C10 7 12 4 14 4Z" />
      <path d="M8.5 15.5 5 19l-2 2 .8-4.8L7 13" />
      <circle cx="15.5" cy="9.5" r="1.8" />
    </svg>
  );
}

/** `assets/icons/upload.svg`, for #174's upload button. */
export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 14v5h14v-5" />
    </svg>
  );
}
