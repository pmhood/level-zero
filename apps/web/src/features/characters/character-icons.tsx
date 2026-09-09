import type { SVGProps } from 'react';

/**
 * The two icons Character Studio needs that `@level-zero/ui` does not yet
 * export, drawn from the design package's own set (`assets/icons/*.svg`) —
 * 24×24, 1.8px rounded stroke, `currentColor`.
 *
 * Feature-local until a second workspace wants them, at which point they
 * belong beside the rest in `packages/ui/src/icons.tsx`.
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

/** `assets/icons/characters.svg` */
export function CharactersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.8 20c.6-4.1 2.2-6 5.2-6s4.6 1.9 5.2 6" />
      <circle cx="17.2" cy="10" r="2.2" />
      <path d="M14.8 15.2c.8-.8 1.7-1.2 2.7-1.2 2.2 0 3.3 1.5 3.7 4.7" />
    </svg>
  );
}

/** `assets/icons/sparkles.svg` — the mark on every generative action. */
export function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m12 2.8 1.3 4.4 4.4 1.3-4.4 1.3L12 14.2l-1.3-4.4-4.4-1.3 4.4-1.3L12 2.8Z" />
      <path d="m18.5 14.2.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7.7-2.2Z" />
    </svg>
  );
}
