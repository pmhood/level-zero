import type { SVGProps } from 'react';

/**
 * `assets/icons/asset-library.svg`, in the shape `packages/ui`'s own icons
 * take — 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local for the same reason `MoodboardIcon` and `WorldIcon` are:
 * `packages/ui`'s icon set belongs to whichever change can own that file
 * outright.
 */
export function AssetsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      <path d="m8.5 5 8 4.5" />
    </svg>
  );
}
