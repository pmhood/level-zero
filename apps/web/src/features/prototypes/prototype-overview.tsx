'use client';

import type { PrototypeVersion } from '@level-zero/domain';
import { Button, SectionPanel, Tag } from '@level-zero/ui';

import { ReviewSection } from '@/features/review/review-section';
import { apiErrorMessage } from '@/lib/api';

import { PrototypeMembersList } from './prototype-members-list';
import { PrototypePlayableSurface } from './prototype-playable-surface';
import { PrototypeVersionDetails } from './prototype-version-details';
import { usePrototypeVersionCompare, usePrototypeVersionContents } from './use-prototypes';

/**
 * The selected prototype version, in full: the playable build as the
 * dominant surface, and — beside it, compact — exactly what it pins, what
 * changed since the version before it, and its status and notes.
 *
 * "Prototype is primary, chrome is secondary" (the issue's own constraint):
 * the playable surface gets the wide column and everything else is
 * read-at-a-glance panels next to it, per spec section 37's layout.
 */
export function PrototypeOverview({
  projectId,
  prototypeId,
  versions,
  selectedVersion,
  onViewCompare,
}: {
  projectId: string;
  prototypeId: string;
  versions: readonly PrototypeVersion[];
  selectedVersion: PrototypeVersion;
  onViewCompare: () => void;
}) {
  const contentsQuery = usePrototypeVersionContents(projectId, prototypeId, selectedVersion.id);
  const previousVersion =
    versions.find((version) => version.versionNumber === selectedVersion.versionNumber - 1) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col">
        {contentsQuery.isPending && (
          <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border border-border bg-surface">
            <p className="text-sm text-muted-foreground">Loading version…</p>
          </div>
        )}

        {contentsQuery.isError && (
          <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface p-6">
            <p className="text-sm text-error">{apiErrorMessage(contentsQuery.error)}</p>
            <Button variant="secondary" size="sm" onClick={() => void contentsQuery.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {contentsQuery.data && (
          <PrototypePlayableSurface projectId={projectId} contents={contentsQuery.data} />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionPanel title="Pinned entities" description="What this version is exactly made of.">
          {contentsQuery.data ? (
            <PrototypeMembersList
              projectId={projectId}
              members={contentsQuery.data.version.members}
              entityVersions={contentsQuery.data.entityVersions}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </SectionPanel>

        <WhatChangedPanel
          projectId={projectId}
          prototypeId={prototypeId}
          previousVersion={previousVersion}
          selectedVersion={selectedVersion}
          onViewCompare={onViewCompare}
        />

        <SectionPanel title="Status & notes">
          <PrototypeVersionDetails
            key={selectedVersion.id}
            projectId={projectId}
            prototypeId={prototypeId}
            version={selectedVersion}
          />
        </SectionPanel>

        {/*
          A prototype version is immutable, so a decision about it stays true:
          keyed by the selected version so switching versions reads that
          version's own review rather than carrying the last one's over.
        */}
        <ReviewSection
          key={selectedVersion.id}
          projectId={projectId}
          target={{ targetType: 'prototype_version', targetId: selectedVersion.id }}
          title="Version review"
          description={`This applies to v${selectedVersion.versionNumber} and nothing after it.`}
        />
      </div>
    </div>
  );
}

function WhatChangedPanel({
  projectId,
  prototypeId,
  previousVersion,
  selectedVersion,
  onViewCompare,
}: {
  projectId: string;
  prototypeId: string;
  previousVersion: PrototypeVersion | null;
  selectedVersion: PrototypeVersion;
  onViewCompare: () => void;
}) {
  const compareQuery = usePrototypeVersionCompare(
    projectId,
    prototypeId,
    previousVersion?.id ?? null,
    selectedVersion.id,
  );

  if (!previousVersion) {
    return (
      <SectionPanel title="What changed">
        <p className="text-sm text-muted-foreground">This is the first version.</p>
      </SectionPanel>
    );
  }

  const comparison = compareQuery.data;
  const changeCount = comparison
    ? comparison.added.length + comparison.removed.length + comparison.changed.length
    : null;

  return (
    <SectionPanel title="What changed" description={`Since v${previousVersion.versionNumber}`}>
      {compareQuery.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}

      {compareQuery.isError && (
        <p className="text-xs text-error">{apiErrorMessage(compareQuery.error)}</p>
      )}

      {comparison && (
        <div className="flex flex-col gap-3">
          {changeCount === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing changed between these versions.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {comparison.added.length > 0 && <Tag>{comparison.added.length} added</Tag>}
              {comparison.changed.length > 0 && <Tag>{comparison.changed.length} changed</Tag>}
              {comparison.removed.length > 0 && <Tag>{comparison.removed.length} removed</Tag>}
            </div>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={onViewCompare}>
            View full compare
          </Button>
        </div>
      )}
    </SectionPanel>
  );
}
