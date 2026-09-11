'use client';

import {
  prototypeVersionDifferences,
  type EntityVersion,
  type PrototypeVersion,
} from '@level-zero/domain';
import {
  Button,
  CompareView,
  EmptyState,
  Field,
  Select,
  StatusBadge,
  type CompareSide,
} from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { PrototypeMembersList } from './prototype-members-list';
import { prototypeVersionStatusBadge } from './prototype-presentation';
import { usePrototypeVersionCompare, usePrototypeVersionContents } from './use-prototypes';

/**
 * Two versions of the same prototype, side by side — reusing the shared
 * `CompareView` and `prototypeVersionDifferences` primitives exactly the way
 * `EntityVersionCompare` reuses them for entity versions (spec section 61).
 *
 * Defaults to the two newest versions, which is "what changed" out of the
 * box; the pickers make it "compare versions" for any pair.
 */
export function PrototypeVersionCompare({
  projectId,
  prototypeId,
  versions,
}: {
  projectId: string;
  prototypeId: string;
  versions: readonly PrototypeVersion[];
}) {
  if (versions.length < 2) {
    return (
      <EmptyState
        title="Nothing to compare yet"
        description="Capture a second version and this shows what moved between them — status, notes and which entity versions are pinned."
      />
    );
  }

  return <Comparison projectId={projectId} prototypeId={prototypeId} versions={versions} />;
}

function Comparison({
  projectId,
  prototypeId,
  versions,
}: {
  projectId: string;
  prototypeId: string;
  versions: readonly PrototypeVersion[];
}) {
  // Newest first, so B defaults to the latest version and A to the one just
  // before it — the two most recently captured, with nobody choosing anything.
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const a = versions.find((version) => version.id === aId) ?? versions[1];
  const b = versions.find((version) => version.id === bId) ?? versions[0];

  const comparison = usePrototypeVersionCompare(
    projectId,
    prototypeId,
    a?.id ?? null,
    b?.id ?? null,
  );
  const aContents = usePrototypeVersionContents(projectId, prototypeId, a?.id ?? null);
  const bContents = usePrototypeVersionContents(projectId, prototypeId, b?.id ?? null);

  const pinned = useMemo<EntityVersion[]>(
    () => [...(aContents.data?.entityVersions ?? []), ...(bContents.data?.entityVersions ?? [])],
    [aContents.data, bContents.data],
  );

  const groups = useMemo(
    () => (comparison.data ? prototypeVersionDifferences(comparison.data, pinned) : []),
    [comparison.data, pinned],
  );

  if (!a || !b) return null;

  const loading = comparison.isPending || aContents.isPending || bContents.isPending;
  const error = comparison.error ?? aContents.error ?? bContents.error;

  const side = (version: PrototypeVersion, members: PrototypeVersion['members']): CompareSide => {
    const badge = prototypeVersionStatusBadge(version.status);
    const contents = version.id === a.id ? aContents.data : bContents.data;

    return {
      label: `v${version.versionNumber}`,
      meta: version.name ?? undefined,
      current: version.id === versions[0]?.id,
      children: (
        <div className="flex min-w-0 flex-col gap-3">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {version.notes && <p className="text-sm text-muted-foreground">{version.notes}</p>}
          {contents ? (
            <PrototypeMembersList
              projectId={projectId}
              members={members}
              entityVersions={contents.entityVersions}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading pinned entities…</p>
          )}
        </div>
      ),
    };
  };

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-muted-foreground">Loading comparison…</p>}
      {error != null && <p className="text-sm text-error">{apiErrorMessage(error)}</p>}

      {comparison.data && (
        <CompareView
          a={side(a, a.members)}
          b={side(b, b.members)}
          groups={groups}
          sameLabel="Nothing moved between these two versions."
          toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="A" htmlFor="prototype-compare-a">
                <Select
                  id="prototype-compare-a"
                  value={a.id}
                  onChange={(event) => setAId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber}
                      {version.name ? ` · ${version.name}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="B" htmlFor="prototype-compare-b">
                <Select
                  id="prototype-compare-b"
                  value={b.id}
                  onChange={(event) => setBId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber}
                      {version.name ? ` · ${version.name}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAId(b.id);
                  setBId(a.id);
                }}
              >
                Swap sides
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
