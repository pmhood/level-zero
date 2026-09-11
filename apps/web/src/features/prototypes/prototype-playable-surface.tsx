import type { PrototypeContents } from '@level-zero/domain';
import { Button, EmptyState } from '@level-zero/ui';

import { assetContentUrl } from '@/lib/api';

import { formatByteSize } from './prototype-presentation';

const BROWSER_PLAYABLE_MIME_TYPES = new Set(['text/html']);

/**
 * The playable/running prototype — the visual focus of the workspace (spec
 * section 37: "Primary focus should be the running game").
 *
 * A version with no build artifact renders an honest empty state rather than
 * anything resembling a player: the issue's own constraint is "do not imply a
 * prototype is runnable when only its design snapshot exists". A build
 * artifact Level Zero can actually run in the browser (an HTML5 export) is
 * embedded directly; anything else is presented as what it is — a file to
 * open outside the app — rather than faked into an iframe that would show
 * nothing.
 */
export function PrototypePlayableSurface({
  projectId,
  contents,
}: {
  projectId: string;
  contents: PrototypeContents;
}) {
  const { version, buildAsset } = contents;

  if (!buildAsset) {
    return (
      <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-surface p-6">
        <EmptyState
          title="No playable build for this version"
          description={
            version.status === 'draft'
              ? 'This version is still a design snapshot — its pinned entities are set, but no build artifact has been attached yet.'
              : 'No build artifact has been attached to this version yet, so there is nothing to run.'
          }
        />
      </div>
    );
  }

  const playableInBrowser = BROWSER_PLAYABLE_MIME_TYPES.has(buildAsset.mimeType);
  const contentUrl = assetContentUrl(projectId, buildAsset.id);

  return (
    <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{buildAsset.filename}</p>
          <p className="text-xs text-faint-foreground">
            {formatByteSize(buildAsset.byteSize)} · {buildAsset.mimeType}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <a href={contentUrl} target="_blank" rel="noreferrer">
            Open build
          </a>
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {playableInBrowser ? (
          <iframe
            src={contentUrl}
            title={`${buildAsset.filename} — playable build`}
            className="size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              This file type can&rsquo;t run inside Level Zero. Open it to play the build outside
              the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
