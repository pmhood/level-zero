import * as React from 'react';

/**
 * A handful of icons from the design package's own set
 * (`assets/icons/*.svg`) — 24×24, 1.8px rounded stroke, `currentColor` — used
 * before reaching for an icon library dependency (README, "assets/icons/").
 * Inlined as components (rather than `<img>`) so `currentColor` tracks the
 * surrounding text color through hover, active and disabled states.
 */
function createIcon(children: React.ReactNode) {
  return function Icon(props: React.SVGProps<SVGSVGElement>) {
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
        {children}
      </svg>
    );
  };
}

/** `assets/icons/overview.svg` */
export const OverviewIcon = createIcon(
  <>
    <rect x="3" y="4" width="8" height="7" rx="1.5" />
    <rect x="13" y="4" width="8" height="7" rx="1.5" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
  </>,
);

/** `assets/icons/idea-lab.svg` */
export const IdeaLabIcon = createIcon(
  <>
    <path d="M9.2 17.8h5.6M10 21h4" />
    <path d="M8.3 15.1A6.2 6.2 0 1 1 15.7 15c-.8.6-1.2 1.3-1.2 2H9.5c0-.7-.4-1.4-1.2-1.9Z" />
  </>,
);

/** `assets/icons/plus.svg` */
export const PlusIcon = createIcon(<path d="M12 5v14M5 12h14" />);

/** `assets/icons/search.svg` */
export const SearchIcon = createIcon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </>,
);

/** `assets/icons/close.svg` */
export const CloseIcon = createIcon(<path d="M6 6l12 12M18 6 6 18" />);

/** `assets/icons/history.svg` — reused for "restore" (undo an archive). */
export const HistoryIcon = createIcon(
  <>
    <path d="M4 4v5h5" />
    <path d="M5.2 8A8 8 0 1 1 4.5 15" />
    <path d="M12 7v5l3 2" />
  </>,
);
