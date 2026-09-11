'use client';

import type { Entity } from '@level-zero/domain';
import { Button, HistoryIcon, Inspector, StatusBadge, Tag } from '@level-zero/ui';

import { entityStatusBadge } from '@/features/entities/entity-presentation';

import { prototypeVersionStatusBadge } from './prototype-presentation';
import { useArchivePrototype, usePrototypeVersions, useRestorePrototype } from './use-prototypes';

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
    </Inspector>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint-foreground">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}
