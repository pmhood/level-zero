import type { SVGProps } from 'react';

/**
 * `assets/icons/prototype.svg`, in the shape `packages/ui`'s own icons take —
 * 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local for the same reason `WorldIcon` and `MoodboardIcon` are:
 * `packages/ui`'s icon set belongs to whichever change can own that file
 * outright.
 */
export function PrototypeIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="m8 3 10 6v9l-10 3-2-8 2-10Z" />
      <path d="m8 3 4 8 6-2M12 11l6 7M12 11l-6 2" />
    </svg>
  );
}
