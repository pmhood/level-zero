import type { SVGProps } from 'react';

/**
 * `assets/icons/world.svg`, in the shape `packages/ui`'s own icons take —
 * 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local because `packages/ui`'s icon set is not this change's to
 * extend; it belongs beside the others in `packages/ui/src/icons.tsx` once one
 * change can own that file.
 */
export function WorldIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 2.7 4.2 5.7 4.2 9S14.8 18.3 12 21M12 3C9.2 5.7 7.8 8.7 7.8 12S9.2 18.3 12 21" />
    </svg>
  );
}
