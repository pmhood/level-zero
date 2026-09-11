'use client';

import type { Entity, Playtest, PrototypeVersion } from '@level-zero/domain';
import { Button, HistoryIcon, Inspector, StatusBadge, Tag } from '@level-zero/ui';

import { AiInspector } from '@/features/ai-inspector/ai-inspector';
import { entityStatusBadge } from '@/features/entities/entity-presentation';

import { prototypeVersionStatusBadge } from './prototype-presentation';
import { usePlaytestsForVersion } from './use-playtests';
import { useArchivePrototype, usePrototypeVersions, useRestorePrototype } from './use-prototypes';

/** As much history as one ask carries; the API refuses a longer excerpt outright. */
const MAX_EXCERPT_LENGTH = 8000;

/**
 * What can be done with the prototype in hand: change its standing in the
 * project, and see how many versions and what state the latest one is in.
 *
 * Status and notes for the *version* currently in view live in the Overview
 * tab, next to the version they belong to — this inspector is about the
 * prototype entity itself, the way `CharacterInspector` and
 * `MechanicInspector` are.
 */
export function PrototypeInspector({
  projectId,
  prototype,
  onClose,
}: {
  projectId: string;
  prototype: Entity;
  onClose?: () => void;
}) {
  const archivePrototype = useArchivePrototype(projectId);
  const restorePrototype = useRestorePrototype(projectId);
  const versionsQuery = usePrototypeVersions(projectId, prototype.id);
  const archived = prototype.status === 'archived';
  const status = entityStatusBadge(prototype.status);

  const versions = versionsQuery.data?.items ?? [];
  const latest = versions[0] ?? null;
  const playtestsQuery = usePlaytestsForVersion(projectId, latest?.id ?? null);

  return (
    <Inspector key={prototype.id} title={prototype.name} description="Prototype" onClose={onClose}>
      <div className="mb-4">
        {archived ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={restorePrototype.isPending}
            onClick={() => restorePrototype.mutate(prototype.id)}
          >
            <HistoryIcon className="size-4" />
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            disabled={archivePrototype.isPending}
            onClick={() => archivePrototype.mutate(prototype.id)}
          >
            Archive
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {prototype.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>

        <dl className="flex flex-col gap-1.5 text-xs">
          <Row label="Versions" value={versionsQuery.isPending ? '…' : String(versions.length)} />
          <Row
            label="Latest version"
            value={
              versionsQuery.isPending
                ? '…'
                : latest
                  ? `v${latest.versionNumber} · ${prototypeVersionStatusBadge(latest.status).label}`
                  : '—'
            }
          />
        </dl>
      </section>

      <div className="mt-5 border-t border-border-subtle pt-4">
        <AiInspector
          projectId={projectId}
          subject={{
            kind: 'entity',
            entity: prototype,
            excerpt: prototypeExcerpt(versions, playtestsQuery.data?.items ?? []),
          }}
        />
      </div>
    </Inspector>
  );
}

/**
 * The version history and the playtests against the newest version, written
 * out for a prompt.
 *
 * Versions and playtests are rows of their own rather than entities, so the
 * relationship walk behind a resolved context cannot reach them. This is the
 * one thing the prototype inspector has to hand over itself — and it hands
 * over what the panel beside it already shows, not an analysis of it.
 */
function prototypeExcerpt(
  versions: readonly PrototypeVersion[],
  playtests: readonly Playtest[],
): string | null {
  const newest = versions[0];
  if (!newest) return null;

  const history = versions.map(
    (version) =>
      `- v${version.versionNumber} · ${prototypeVersionStatusBadge(version.status).label}${
        version.notes ? ` — ${version.notes}` : ''
      }`,
  );

  const recorded = playtests.map(
    (playtest) =>
      `- ${playtest.name} · ${playtest.status}${playtest.goal ? ` — ${playtest.goal}` : ''}`,
  );

  return [
    ['Version history, newest first:', ...history].join('\n'),
    ...(recorded.length > 0
      ? [[`Playtests of v${newest.versionNumber}:`, ...recorded].join('\n')]
      : []),
  ]
    .join('\n\n')
    .slice(0, MAX_EXCERPT_LENGTH);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint-foreground">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}
