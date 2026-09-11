'use client';

import type { Entity } from '@level-zero/domain';
import { Button, HistoryIcon, Inspector, Tabs } from '@level-zero/ui';
import { useState } from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';

import { MechanicHistory } from './mechanic-history';
import { MechanicLinks } from './mechanic-links';
import { useArchiveMechanic, useRestoreMechanic } from './use-mechanics';

type InspectorTab = 'links' | 'history';

/**
 * What can I do with the mechanic I have selected: how it connects, what it
 * has been, and whether it is still part of the design (spec section 21).
 */
export function MechanicInspector({
  projectId,
  mechanic,
  onClose,
}: {
  projectId: string;
  mechanic: Entity;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('links');
  const archiveMechanic = useArchiveMechanic(projectId);
  const restoreMechanic = useRestoreMechanic(projectId);
  const archived = mechanic.status === 'archived';

  return (
    <Inspector
      key={mechanic.id}
      title={mechanic.name}
      description={entityTypeLabel(mechanic.type)}
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
            disabled={restoreMechanic.isPending}
            onClick={() => restoreMechanic.mutate(mechanic.id)}
          >
            <HistoryIcon className="size-4" />
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            disabled={archiveMechanic.isPending}
            onClick={() => archiveMechanic.mutate(mechanic.id)}
          >
            Archive
          </Button>
        )}
      </div>

      {tab === 'links' && <MechanicLinks projectId={projectId} mechanic={mechanic} />}
      {tab === 'history' && <MechanicHistory projectId={projectId} mechanic={mechanic} />}
    </Inspector>
  );
}
