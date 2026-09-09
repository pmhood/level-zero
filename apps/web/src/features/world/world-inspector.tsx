'use client';

import type { Entity } from '@level-zero/domain';
import { Button, HistoryIcon, Inspector, Tabs } from '@level-zero/ui';
import { useState } from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';

import { WorldHistory } from './world-history';
import { WorldLinks } from './world-links';
import { useArchiveWorldEntity, useRestoreWorldEntity } from './use-world';

type InspectorTab = 'links' | 'history';

/**
 * What can I do with the part of the world I have selected: how it connects,
 * what it has been, and whether it is still part of the setting (spec
 * section 21).
 */
export function WorldInspector({
  projectId,
  entity,
  onClose,
}: {
  projectId: string;
  entity: Entity;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('links');
  const archiveEntity = useArchiveWorldEntity(projectId);
  const restoreEntity = useRestoreWorldEntity(projectId);
  const archived = entity.status === 'archived';

  return (
    <Inspector
      key={entity.id}
      title={entity.name}
      description={entityTypeLabel(entity.type)}
      onClose={onClose}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as InspectorTab)}
          items={[
            { value: 'links', label: 'Links' },
            { value: 'history', label: 'History' },
          ]}
        />
        {archived ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={restoreEntity.isPending}
            onClick={() => restoreEntity.mutate(entity.id)}
          >
            <HistoryIcon className="size-4" />
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            disabled={archiveEntity.isPending}
            onClick={() => archiveEntity.mutate(entity.id)}
          >
            Archive
          </Button>
        )}
      </div>

      {tab === 'links' && <WorldLinks projectId={projectId} entity={entity} />}
      {tab === 'history' && <WorldHistory projectId={projectId} entity={entity} />}
    </Inspector>
  );
}
