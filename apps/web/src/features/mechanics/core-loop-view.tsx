'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, Field, Panel, Select, StatusBadge, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { moveStep, orderLoopSteps, stepIds, writeStepOrder, type LoopStep } from './core-loop';
import { implementationStatusBadge, mechanicAreaLabel, readMechanic } from './mechanic';
import {
  useAddLoopStep,
  useMechanic,
  useMechanicLinks,
  useSetLoopOrder,
  useUnlinkMechanic,
} from './use-mechanics';

function StepRow({
  step,
  position,
  total,
  selected,
  onSelect,
  onMove,
  onRemove,
  busy,
}: {
  step: LoopStep;
  position: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const mechanic = readMechanic(step.entity);
  const progress = implementationStatusBadge(mechanic.implementationStatus);

  return (
    <li className="flex flex-col">
      <Panel
        className={
          selected
            ? 'flex items-center gap-3 border-primary p-3 ring-1 ring-[var(--lz-blue-muted)]'
            : 'flex items-center gap-3 p-3'
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-active text-xs font-semibold text-primary">
          {position + 1}
        </span>

        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
          aria-label={`Open ${step.entity.name}`}
        >
          <p className="truncate text-sm font-medium text-foreground">{step.entity.name}</p>
          <p className="text-xs text-faint-foreground">{mechanicAreaLabel(mechanic.area)}</p>
        </button>

        {step.entity.status === 'archived' && <Tag>Archived</Tag>}
        <StatusBadge tone={progress.tone}>{progress.label}</StatusBadge>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || position === 0}
            aria-label={`Move ${step.entity.name} earlier`}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || position === total - 1}
            aria-label={`Move ${step.entity.name} later`}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Remove ${step.entity.name} from the loop`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </Panel>

      <span aria-hidden="true" className="py-1 pl-[26px] text-sm text-faint-foreground">
        ↓
      </span>
    </li>
  );
}

function AddStepForm({
  loop,
  steps,
  candidates,
}: {
  loop: Entity;
  steps: LoopStep[];
  candidates: Entity[];
}) {
  const [stepEntityId, setStepEntityId] = useState('');
  const addStep = useAddLoopStep(loop.projectId);

  const inLoop = new Set(stepIds(steps));
  const available = candidates.filter(
    (candidate) => candidate.id !== loop.id && !inLoop.has(candidate.id),
  );

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!stepEntityId) return;
        addStep.mutate(
          {
            loop,
            stepEntityId,
            data: writeStepOrder(loop, [...stepIds(steps), stepEntityId]),
          },
          { onSuccess: () => setStepEntityId('') },
        );
      }}
    >
      <Field label="Add a step" className="min-w-0 flex-1">
        <Select
          aria-label="Mechanic to add to the loop"
          value={stepEntityId}
          onChange={(event) => setStepEntityId(event.target.value)}
        >
          <option value="">Choose a mechanic…</option>
          {available.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" disabled={!stepEntityId || addStep.isPending}>
        {addStep.isPending ? 'Adding…' : 'Add step'}
      </Button>
    </form>
  );
}

function Loop({
  loop,
  candidates,
  selectedId,
  onSelect,
}: {
  loop: Entity;
  candidates: Entity[];
  selectedId: string | null;
  onSelect: (entity: Entity) => void;
}) {
  const links = useMechanicLinks(loop.projectId, loop.id);
  const setOrder = useSetLoopOrder(loop.projectId);
  const unlink = useUnlinkMechanic(loop.projectId);

  if (links.isPending) {
    return <p className="text-sm text-muted-foreground">Loading the loop…</p>;
  }

  if (links.isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-error">{apiErrorMessage(links.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => links.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const steps = orderLoopSteps(loop, links.data.outgoing);
  const busy = setOrder.isPending || unlink.isPending;

  return (
    <div className="flex flex-col gap-4">
      {steps.length === 0 ? (
        <EmptyState
          title="This loop has no steps yet"
          description="Add the mechanics a player moves through, in the order they meet them. The mechanics stay where they are — the loop only points at them."
        />
      ) : (
        <>
          <ol className="flex flex-col">
            {steps.map((step, index) => (
              <StepRow
                key={step.relationshipId}
                step={step}
                position={index}
                total={steps.length}
                busy={busy}
                selected={step.entity.id === selectedId}
                onSelect={() => onSelect(step.entity)}
                onMove={(offset) =>
                  setOrder.mutate({
                    loop,
                    data: writeStepOrder(loop, stepIds(moveStep(steps, index, offset))),
                  })
                }
                onRemove={() =>
                  unlink.mutate({ entityId: loop.id, relationshipId: step.relationshipId })
                }
              />
            ))}
          </ol>

          <p className="text-xs text-faint-foreground">
            …and back to <span className="text-muted-foreground">{steps[0]!.entity.name}</span>.
          </p>
        </>
      )}

      {(setOrder.isError || unlink.isError) && (
        <p className="text-xs text-error">
          {apiErrorMessage(setOrder.error ?? unlink.error, 'Could not change the loop.')}
        </p>
      )}

      {loop.status !== 'archived' && (
        <AddStepForm loop={loop} steps={steps} candidates={candidates} />
      )}
    </div>
  );
}

/**
 * The core loop: an ordered walk through mechanics the project already has.
 *
 * The loop is a `system` entity that `contains` its steps, so nothing here is
 * a copy — renaming a mechanic renames the step, and archiving one shows it as
 * archived in the loop rather than hiding the gap.
 */
export function CoreLoopView({
  projectId,
  loops,
  candidates,
  selectedId,
  onSelect,
}: {
  projectId: string;
  /** The project's `system` entities; each one can express a loop. */
  loops: Entity[];
  /** The mechanics a step can point at. */
  candidates: Entity[];
  selectedId: string | null;
  onSelect: (entity: Entity) => void;
}) {
  const [loopId, setLoopId] = useState<string | null>(null);
  const activeLoopId = loopId && loops.some((loop) => loop.id === loopId) ? loopId : loops[0]?.id;
  const loopQuery = useMechanic(projectId, activeLoopId ?? null);

  if (loops.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <EmptyState
          title="No systems to loop yet"
          description="A loop is a system that contains other mechanics. Create one from the inspector — choose System as its kind — then add the steps a player moves through."
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <Field label="Loop" htmlFor="core-loop-select" className="max-w-[320px]">
        <Select
          id="core-loop-select"
          value={activeLoopId ?? ''}
          onChange={(event) => setLoopId(event.target.value)}
        >
          {loops.map((loop) => (
            <option key={loop.id} value={loop.id}>
              {loop.name}
            </option>
          ))}
        </Select>
      </Field>

      {loopQuery.isPending && <p className="text-sm text-muted-foreground">Loading the loop…</p>}

      {loopQuery.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-error">{apiErrorMessage(loopQuery.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => loopQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {loopQuery.isSuccess && (
        <Loop
          key={loopQuery.data.id}
          loop={loopQuery.data}
          candidates={candidates}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
