'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, Select, StatusBadge, Tabs, Tag, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { TagInput } from '@/components/tag-input';
import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import { WorldLore } from './world-lore';
import {
  CANON_STATUSES,
  WORLD_RISKS,
  canonStatusBadge,
  readWorld,
  riskLabel,
  writeWorld,
  type CanonStatus,
  type WorldRisk,
} from './world';
import { useUpdateWorldEntity } from './use-world';

type DetailTab = 'canon' | 'lore';

interface WorldDraft {
  name: string;
  description: string;
  tags: string[];
  era: string;
  canonStatus: CanonStatus;
  risk: WorldRisk;
}

function draftOf(entity: Entity): WorldDraft {
  const { era, canonStatus, risk } = readWorld(entity);

  return {
    name: entity.name,
    description: entity.description ?? '',
    tags: entity.tags,
    era,
    canonStatus,
    risk,
  };
}

/**
 * The centre column: one surface for every kind of world object.
 *
 * A region, a faction and a hazard differ in what they are linked to, not in
 * what they are — so they share these fields, and the eight types get eight
 * places on the dashboard rather than eight bespoke editors.
 */
export function WorldDetail({
  projectId,
  entity,
  onOpenReference,
}: {
  projectId: string;
  entity: Entity;
  onOpenReference: (referenced: Entity) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('canon');
  const [draft, setDraft] = useState<WorldDraft>(() => draftOf(entity));
  const updateEntity = useUpdateWorldEntity(projectId);

  const archived = entity.status === 'archived';
  const saved = readWorld(entity);
  const canon = canonStatusBadge(saved.canonStatus);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(entity));
  const nameIsEmpty = draft.name.trim().length === 0;

  function set<K extends keyof WorldDraft>(key: K, value: WorldDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (archived || !dirty || nameIsEmpty) return;

    updateEntity.mutate({
      entityId: entity.id,
      patch: {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        tags: draft.tags,
        data: writeWorld(entity, {
          era: draft.era.trim(),
          canonStatus: draft.canonStatus,
          risk: draft.risk,
        }),
      },
    });
  }

  return (
    <section aria-label="World detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{entity.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">
            {entityTypeLabel(entity.type)}
            {saved.era && ` · ${saved.era}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived && <Tag>Archived</Tag>}
          {saved.risk !== 'none' && <Tag>{riskLabel(saved.risk)}</Tag>}
          <StatusBadge tone={canon.tone}>{canon.label}</StatusBadge>
        </div>
      </header>

      <div className="px-5 pt-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as DetailTab)}
          items={[
            { value: 'canon', label: 'Canon' },
            { value: 'lore', label: 'Lore' },
          ]}
        />
      </div>

      {archived && (
        <p className="px-5 pt-3 text-xs text-faint-foreground">
          Restore this before editing it. Its links and history are intact.
        </p>
      )}

      {tab === 'lore' ? (
        <div className="px-5 py-4">
          <WorldLore projectId={projectId} entity={entity} onOpenReference={onOpenReference} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <fieldset disabled={archived} className="flex flex-col gap-4 disabled:opacity-60">
            <Field label="Name" htmlFor="world-name">
              <Input
                id="world-name"
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Era" htmlFor="world-era" hint="Orders the timeline.">
                <Input
                  id="world-era"
                  value={draft.era}
                  placeholder="c. 2226"
                  onChange={(event) => set('era', event.target.value)}
                />
              </Field>

              <Field
                label="Canon"
                htmlFor="world-canon-status"
                hint="How settled this is, not whether it is still in the project."
              >
                <Select
                  id="world-canon-status"
                  value={draft.canonStatus}
                  onChange={(event) => set('canonStatus', event.target.value as CanonStatus)}
                >
                  {CANON_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {canonStatusBadge(status).label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Risk" htmlFor="world-risk" hint="What this place or force costs.">
                <Select
                  id="world-risk"
                  value={draft.risk}
                  onChange={(event) => set('risk', event.target.value as WorldRisk)}
                >
                  {WORLD_RISKS.map((risk) => (
                    <option key={risk} value={risk}>
                      {riskLabel(risk)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Summary" htmlFor="world-description">
              <Textarea
                id="world-description"
                value={draft.description}
                placeholder="One or two sentences, for anyone scanning the world."
                onChange={(event) => set('description', event.target.value)}
              />
            </Field>

            <Field
              label="Tags"
              hint="The setting's environment vocabulary — vacuum, low gravity, contested."
            >
              <TagInput tags={draft.tags} onChange={(tags) => set('tags', tags)} />
            </Field>
          </fieldset>

          {updateEntity.isError && (
            <p className="text-xs text-error">
              {apiErrorMessage(updateEntity.error, 'Could not save this.')}
            </p>
          )}

          {!archived && (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!dirty || nameIsEmpty || updateEntity.isPending}>
                {updateEntity.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              {dirty && <p className="text-xs text-faint-foreground">Unsaved changes</p>}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
