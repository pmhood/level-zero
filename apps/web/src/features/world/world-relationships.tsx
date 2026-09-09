'use client';

import type { Entity, NeighborEdge } from '@level-zero/domain';
import { Button, EmptyState, Field, Select, StatusBadge, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { entityTypeLabel, relationLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import { groupHoldings, type HoldingGroupKey } from './world-holdings';
import { canonStatusBadge, isWorldEntity, isWorldPlace, readWorld, riskLabel } from './world';
import { useWorldEntity, useWorldLinks } from './use-world';

/**
 * What each clause of the question is called, and what an empty one means.
 *
 * The prompts are the point: a region nobody holds and where nothing happens
 * is a hole in the setting, and this is the view that shows it.
 */
const GROUP_COPY: Record<HoldingGroupKey, { title: string; empty: string }> = {
  heldBy: {
    title: 'Held by',
    empty:
      'Nobody holds this. Link a faction with "Controls" to say who does — or leave it unclaimed on purpose.',
  },
  within: {
    title: 'Sits within',
    empty: 'Not inside anything yet. Link the region or location this belongs to.',
  },
  contains: {
    title: 'Contains',
    empty: 'Nothing inside it yet.',
  },
  presentHere: {
    title: 'At stake here',
    empty:
      'Nothing appears here. A place with no hazard, event or person in it is scenery — link what the player would meet.',
  },
  references: {
    title: 'Maps & references',
    empty: 'No map or reference attached. Link an asset reference to give this place a picture.',
  },
  other: {
    title: 'Other links',
    empty: '',
  },
};

/**
 * The World relationship view: for one place, *who holds it, what is inside
 * it, and what is at stake there?*
 *
 * The data is the canonical relationship graph — the same edges the inspector
 * writes — read one hop out from the place in hand and sorted by what each
 * edge means for the setting. A node canvas was considered and rejected: the
 * neighbourhood endpoint answers one hop at a time, so a whole-project canvas
 * would be a request per entity, and an unplaced scatter of nodes answers no
 * question a designer is actually asking.
 */
export function WorldRelationships({
  projectId,
  places,
  selectedId,
  onSelect,
}: {
  projectId: string;
  /** The regions and locations of the project — a graph is read from a place. */
  places: Entity[];
  selectedId: string | null;
  /** Opens the entity in the inspector; the tab stays on the graph. */
  onSelect: (entity: Entity) => void;
}) {
  const [placeId, setPlaceId] = useState<string | null>(null);
  const preferred =
    selectedId && places.some((place) => place.id === selectedId) ? selectedId : null;
  const activeId =
    (placeId && places.some((place) => place.id === placeId) ? placeId : null) ??
    preferred ??
    places[0]?.id ??
    null;

  const placeQuery = useWorldEntity(projectId, activeId);

  // Following an edge is how the graph is walked: opening a neighbouring place
  // re-reads the question from there rather than leaving for the detail column.
  function open(entity: Entity) {
    if (isWorldPlace(entity)) setPlaceId(entity.id);
    onSelect(entity);
  }

  if (places.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 overflow-y-auto p-5">
        <EmptyState
          title="No places to read the world from"
          description="Territory is the spine of a setting. Create a region or a location, then link the factions that want it and the hazards that live there."
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <Field
        label="Place"
        htmlFor="world-place-select"
        hint="Who holds it, what is inside it, and what is at stake there."
        className="max-w-[320px]"
      >
        <Select
          id="world-place-select"
          value={activeId ?? ''}
          onChange={(event) => setPlaceId(event.target.value)}
        >
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name} · {entityTypeLabel(place.type)}
            </option>
          ))}
        </Select>
      </Field>

      {placeQuery.isPending && <p className="text-sm text-muted-foreground">Loading the place…</p>}

      {placeQuery.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-error">{apiErrorMessage(placeQuery.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => placeQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {placeQuery.isSuccess && (
        <PlaceHoldings
          key={placeQuery.data.id}
          projectId={projectId}
          place={placeQuery.data}
          onSelect={open}
        />
      )}
    </div>
  );
}

function PlaceHoldings({
  projectId,
  place,
  onSelect,
}: {
  projectId: string;
  place: Entity;
  onSelect: (entity: Entity) => void;
}) {
  const links = useWorldLinks(projectId, place.id);

  if (links.isPending) {
    return <p className="text-sm text-muted-foreground">Loading relationships…</p>;
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

  const groups = groupHoldings(links.data).filter(
    (group) => group.key !== 'other' || group.edges.length > 0,
  );
  const risk = readWorld(place).risk;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">{place.name}</h3>
        {place.status === 'archived' && <Tag>Archived</Tag>}
        {risk !== 'none' && <Tag>{riskLabel(risk)}</Tag>}
      </div>

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            {GROUP_COPY[group.key].title}
          </h4>
          {group.edges.length === 0 ? (
            <p className="text-sm text-faint-foreground">{GROUP_COPY[group.key].empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {group.edges.map((edge) => (
                <li key={edge.relationship.id}>
                  <HoldingRow edge={edge} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function HoldingRow({
  edge,
  onSelect,
}: {
  edge: NeighborEdge;
  onSelect: (entity: Entity) => void;
}) {
  const canon = canonStatusBadge(readWorld(edge.entity).canonStatus);
  const relation =
    edge.direction === 'outgoing'
      ? relationLabel(edge.relationship.relation)
      : `${relationLabel(edge.relationship.relation)} by`;

  return (
    <button
      type="button"
      onClick={() => onSelect(edge.entity)}
      aria-label={`Open ${edge.entity.name}`}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border-subtle bg-raised px-3 py-2 text-left hover:border-border-strong"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{edge.entity.name}</span>
        <span className="block text-xs text-faint-foreground">
          {entityTypeLabel(edge.entity.type)} · {relation}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {edge.entity.status === 'archived' && <Tag>Archived</Tag>}
        {isWorldEntity(edge.entity) && <StatusBadge tone={canon.tone}>{canon.label}</StatusBadge>}
      </span>
    </button>
  );
}
