import type { AssetKind } from '@level-zero/domain';
import { DocumentIcon } from '@level-zero/ui';
import type { ComponentType, SVGProps } from 'react';

/**
 * The type-appropriate placeholder a non-visual asset gets in grid view
 * instead of a broken image (issue #171's acceptance criteria) — no
 * thumbnail generation exists yet (#176), so a video, an audio clip or a 3D
 * file shows a kind icon rather than attempting a preview it cannot have.
 *
 * Drawn from the design package's own set (`assets/icons/*.svg`) where one
 * exists; `assets/icons/` has no waveform, so audio is drawn to the set's
 * geometry, the same way `StarIcon` is in `packages/ui/src/icons.tsx`.
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

/** `assets/icons/play.svg` */
function VideoPlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4V8Z" />
    </svg>
  );
}

/** No waveform exists in `assets/icons/`; drawn to the set's own geometry. */
function AudioPlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 10v4M9 6v12M13 9v6M17 4v16M21 10v4" />
    </svg>
  );
}

/** `assets/icons/cube.svg` */
function ModelPlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  );
}

/** `assets/icons/download.svg` */
function ExportPlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4v12M7.5 11.5 12 16l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

/** `assets/icons/build.svg` */
function BuildArtifactPlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m14.8 4.2 5 5-8.8 8.8-5.7 1.4 1.4-5.7 8.1-9.5Z" />
      <path d="m13 6 5 5M5.3 19.4 3 21l1.6-2.3" />
    </svg>
  );
}

const KIND_PLACEHOLDER_ICONS: Record<AssetKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  // Reached only when an image fails to load (AssetPreview's onError) — a
  // generic file glyph reads better than a broken-picture icon.
  image: DocumentIcon,
  video: VideoPlaceholderIcon,
  audio: AudioPlaceholderIcon,
  model_3d: ModelPlaceholderIcon,
  reference: DocumentIcon,
  export: ExportPlaceholderIcon,
  build_artifact: BuildArtifactPlaceholderIcon,
};

export function AssetKindPlaceholderIcon({
  kind,
  className,
}: {
  kind: AssetKind;
  className?: string;
}) {
  const Icon = KIND_PLACEHOLDER_ICONS[kind];
  return <Icon className={className} />;
}
