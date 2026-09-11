'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, Select, Tabs, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { TagInput } from '@/components/tag-input';
import { EntityVersionCompare } from '@/features/entities/entity-version-compare';
import { EntityVisualDecisions } from '@/features/selection/entity-visual-decisions';
import { WORLD_VISUAL_PURPOSES } from '@/features/selection/selection';
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

type DetailTab = 'canon' | 'lore' | 'visuals' | 'compare';

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
 * The tabs and panels beneath a world entity's header — one surface for every
 * kind of world object.
 *
 * A region, a faction and a hazard differ in what they are linked to, not in
 * what they are — so they share these fields, and the eight types get eight
 * places on the dashboard rather than eight bespoke editors.
 */
export function WorldDetailBody({
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
    <>
      <div className="px-5 pt-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as DetailTab)}
          items={[
            { value: 'canon', label: 'Canon' },
            { value: 'lore', label: 'Lore' },
            { value: 'visuals', label: 'Visuals' },
            { value: 'compare', label: 'Compare' },
          ]}
        />
      </div>

      {archived && (
        <p className="px-5 pt-3 text-xs text-faint-foreground">
          Restore this before editing it. Its links and history are intact.
        </p>
      )}

      {tab === 'compare' ? (
        <div className="px-5 py-4">
          <EntityVersionCompare projectId={projectId} entity={entity} />
        </div>
      ) : tab === 'lore' ? (
        <div className="px-5 py-4">
          <WorldLore projectId={projectId} entity={entity} onOpenReference={onOpenReference} />
        </div>
      ) : tab === 'visuals' ? (
        <div className="px-5 py-4">
          <EntityVisualDecisions
            projectId={projectId}
            entity={entity}
            purposes={WORLD_VISUAL_PURPOSES}
          />
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
    </>
  );
}
