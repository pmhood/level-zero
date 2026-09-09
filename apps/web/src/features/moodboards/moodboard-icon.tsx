import type { SVGProps } from 'react';

/**
 * `assets/icons/moodboard.svg`, in the shape `packages/ui`'s own icons take —
 * 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local for the same reason `WorldIcon` is: `packages/ui`'s icon set
 * belongs to whichever change can own that file outright.
 */
export function MoodboardIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.5" />
      <path d="m5 17 4.3-4.2 3.2 3 2.2-2.2L19 17" />
    </svg>
  );
}
