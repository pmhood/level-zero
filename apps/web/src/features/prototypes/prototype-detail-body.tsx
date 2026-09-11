'use client';

import type { Entity } from '@level-zero/domain';
import { EmptyState, Tabs } from '@level-zero/ui';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { PrototypeOverview } from './prototype-overview';
import { PrototypePlaytests } from './prototype-playtests';
import { PrototypeVersionCompare } from './prototype-version-compare';
import { PrototypeVersionStrip } from './prototype-version-strip';
import { usePrototypeVersions } from './use-prototypes';

type DetailTab = 'overview' | 'playtests' | 'compare';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'playtests', label: 'Playtests' },
  { value: 'compare', label: 'Compare' },
];

/**
 * The tabs and panels beneath a prototype's header: the version selector,
 * the playable surface, what it pins, what changed, and its playtests.
 *
 * Version selection lives here rather than in a parent, so this body is
 * self-contained the way `docs/decisions/canonical-entity-routes.md` §6
 * requires of a canonical-route body — it is handed only `projectId` and
 * `entity` and renders identically whether it is reached from the Prototypes
 * workspace or from `/projects/:projectId/entities/:entityId`.
 */
export function PrototypeDetailBody({ projectId, entity }: { projectId: string; entity: Entity }) {
  const versionsQuery = usePrototypeVersions(projectId, entity.id);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [versionId, setVersionId] = useState<string | null>(null);

  if (versionsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading versions…</p>;
  }

  if (versionsQuery.isError) {
    return <p className="text-sm text-error">{apiErrorMessage(versionsQuery.error)}</p>;
  }

  const versions = versionsQuery.data.items;
  // Newest first (`listForPrototype` orders by `versionNumber desc`), so the
  // fallback when nothing has been explicitly picked is the latest version.
  const selectedVersion =
    versions.find((version) => version.id === versionId) ?? versions[0] ?? null;

  if (!selectedVersion) {
    return (
      <EmptyState
        title="No versions captured yet"
        description="A prototype has nothing to browse until a first version pins the entities it is made of."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PrototypeVersionStrip
        versions={versions}
        selectedId={selectedVersion.id}
        onSelect={setVersionId}
      />

      <Tabs items={TABS} value={tab} onChange={(value) => setTab(value as DetailTab)} />

      {tab === 'overview' && (
        <PrototypeOverview
          projectId={projectId}
          prototypeId={entity.id}
          versions={versions}
          selectedVersion={selectedVersion}
          onViewCompare={() => setTab('compare')}
        />
      )}

      {tab === 'playtests' && (
        <PrototypePlaytests projectId={projectId} version={selectedVersion} />
      )}

      {tab === 'compare' && (
        <PrototypeVersionCompare
          projectId={projectId}
          prototypeId={entity.id}
          versions={versions}
        />
      )}
    </div>
  );
}
