'use client';

import { parameterDefinitionIssues, type Entity, type Parameter } from '@level-zero/domain';
import { Button, Field, Input, Select, StatusBadge, Tabs, Tag, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { TagInput } from '@/components/tag-input';
import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import { MechanicListField } from './mechanic-list-field';
import { MechanicParameters } from './mechanic-parameters';
import { MechanicRationale } from './mechanic-rationale';
import {
  IMPLEMENTATION_STATUSES,
  MECHANIC_AREAS,
  implementationStatusBadge,
  mechanicAreaLabel,
  readMechanic,
  writeMechanic,
  type ImplementationStatus,
  type MechanicArea,
} from './mechanic';
import { useUpdateMechanic } from './use-mechanics';

type DetailTab = 'design' | 'rules' | 'tuning' | 'rationale';

interface MechanicDraft {
  name: string;
  description: string;
  tags: string[];
  area: MechanicArea;
  fantasy: string;
  implementationStatus: ImplementationStatus;
  rules: string[];
  inputs: string[];
  outputs: string[];
  tuningParameters: Parameter[];
}

function draftOf(mechanic: Entity): MechanicDraft {
  const { area, fantasy, implementationStatus, rules, inputs, outputs, tuningParameters } =
    readMechanic(mechanic);

  return {
    name: mechanic.name,
    description: mechanic.description ?? '',
    tags: mechanic.tags,
    area,
    fantasy,
    implementationStatus,
    rules,
    inputs,
    outputs,
    tuningParameters,
  };
}

/** Blank lines are a side effect of editing in place, never a rule. */
function clean(items: string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/**
 * The centre column: everything structured about one mechanic.
 *
 * The structured values and the prose are edited apart on purpose — rules,
 * inputs and outputs stay as values that other views can read and reorder,
 * and the rationale that explains them is rich text that autosaves on its own.
 */
export function MechanicDetail({ projectId, mechanic }: { projectId: string; mechanic: Entity }) {
  const [tab, setTab] = useState<DetailTab>('design');
  const [draft, setDraft] = useState<MechanicDraft>(() => draftOf(mechanic));
  const updateMechanic = useUpdateMechanic(projectId);

  const archived = mechanic.status === 'archived';
  const saved = readMechanic(mechanic);
  const progress = implementationStatusBadge(saved.implementationStatus);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(mechanic));
  const nameIsEmpty = draft.name.trim().length === 0;
  // A parameter nobody can tune — no label, a range with one end, an option
  // list with nothing in it — is held back; a value the bounds have moved out
  // from under is not, because that one is often what the edit is fixing.
  const parametersAreBroken = draft.tuningParameters.some(
    (parameter) => parameterDefinitionIssues(parameter).length > 0,
  );

  function set<K extends keyof MechanicDraft>(key: K, value: MechanicDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (archived || !dirty || nameIsEmpty || parametersAreBroken) return;

    updateMechanic.mutate({
      entityId: mechanic.id,
      patch: {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        tags: draft.tags,
        data: writeMechanic(mechanic, {
          area: draft.area,
          fantasy: draft.fantasy.trim(),
          implementationStatus: draft.implementationStatus,
          rules: clean(draft.rules),
          inputs: clean(draft.inputs),
          outputs: clean(draft.outputs),
          tuningParameters: draft.tuningParameters,
        }),
      },
    });
  }

  return (
    <section aria-label="Mechanic detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{mechanic.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">
            {entityTypeLabel(mechanic.type)} · {mechanicAreaLabel(saved.area)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived && <Tag>Archived</Tag>}
          <StatusBadge tone={progress.tone}>{progress.label}</StatusBadge>
        </div>
      </header>

      <div className="px-5 pt-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as DetailTab)}
          items={[
            { value: 'design', label: 'Design' },
            { value: 'rules', label: 'Rules & I/O' },
            { value: 'tuning', label: 'Tuning' },
            { value: 'rationale', label: 'Rationale' },
          ]}
        />
      </div>

      {archived && (
        <p className="px-5 pt-3 text-xs text-faint-foreground">
          Restore this mechanic before editing it. Its links and history are intact.
        </p>
      )}

      {tab === 'rationale' ? (
        <div className="px-5 py-4">
          <MechanicRationale projectId={projectId} mechanic={mechanic} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <fieldset disabled={archived} className="flex flex-col gap-4 disabled:opacity-60">
            {tab === 'design' && <DesignFields draft={draft} set={set} />}
            {tab === 'rules' && <RulesFields draft={draft} set={set} />}
            {tab === 'tuning' && (
              <MechanicParameters
                parameters={draft.tuningParameters}
                onChange={(parameters) => set('tuningParameters', parameters)}
              />
            )}
          </fieldset>

          {updateMechanic.isError && (
            <p className="text-xs text-error">
              {apiErrorMessage(updateMechanic.error, 'Could not save this mechanic.')}
            </p>
          )}

          {!archived && (
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!dirty || nameIsEmpty || parametersAreBroken || updateMechanic.isPending}
              >
                {updateMechanic.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              {dirty && <p className="text-xs text-faint-foreground">Unsaved changes</p>}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

interface FieldsProps {
  draft: MechanicDraft;
  set: <K extends keyof MechanicDraft>(key: K, value: MechanicDraft[K]) => void;
}

function DesignFields({ draft, set }: FieldsProps) {
  return (
    <>
      <Field label="Name" htmlFor="mechanic-name">
        <Input
          id="mechanic-name"
          value={draft.name}
          onChange={(event) => set('name', event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Area" htmlFor="mechanic-area">
          <Select
            id="mechanic-area"
            value={draft.area}
            onChange={(event) => set('area', event.target.value as MechanicArea)}
          >
            {MECHANIC_AREAS.map((area) => (
              <option key={area} value={area}>
                {mechanicAreaLabel(area)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Implementation"
          htmlFor="mechanic-implementation-status"
          hint="How far this has got, not whether the design is settled."
        >
          <Select
            id="mechanic-implementation-status"
            value={draft.implementationStatus}
            onChange={(event) =>
              set('implementationStatus', event.target.value as ImplementationStatus)
            }
          >
            {IMPLEMENTATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {implementationStatusBadge(status).label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Player fantasy"
        htmlFor="mechanic-fantasy"
        hint="What this is meant to feel like from the player's side."
      >
        <Textarea
          id="mechanic-fantasy"
          value={draft.fantasy}
          placeholder="Air is running out and the good salvage is deeper…"
          onChange={(event) => set('fantasy', event.target.value)}
        />
      </Field>

      <Field label="Summary" htmlFor="mechanic-description">
        <Textarea
          id="mechanic-description"
          value={draft.description}
          placeholder="One or two sentences, for anyone scanning the list."
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <Field label="Tags">
        <TagInput tags={draft.tags} onChange={(tags) => set('tags', tags)} />
      </Field>
    </>
  );
}

function RulesFields({ draft, set }: FieldsProps) {
  return (
    <>
      <MechanicListField
        label="Rules"
        id="mechanic-rules"
        hint="One rule per line, in the order they apply."
        items={draft.rules}
        onChange={(rules) => set('rules', rules)}
        placeholder="Oxygen drains twice as fast while sprinting"
      />

      <MechanicListField
        label="Inputs"
        id="mechanic-inputs"
        hint="What the system consumes or reads: player actions, resources, other systems."
        items={draft.inputs}
        onChange={(inputs) => set('inputs', inputs)}
        placeholder="Oxygen tank capacity"
      />

      <MechanicListField
        label="Outputs"
        id="mechanic-outputs"
        hint="What it produces: state changes, rewards, pressure on another system."
        items={draft.outputs}
        onChange={(outputs) => set('outputs', outputs)}
        placeholder="Time pressure on the return trip"
      />
    </>
  );
}
