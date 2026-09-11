import type { Entity, EntityType } from '@level-zero/domain';
import type { ReactNode } from 'react';

import { CharacterDetailBody } from '@/features/characters/character-detail-body';
import { MechanicDetailBody } from '@/features/mechanics/mechanic-detail-body';
import { PrototypeDetailBody } from '@/features/prototypes/prototype-detail-body';
import { WorldDetailBody } from '@/features/world/world-detail-body';

/**
 * A type-specific body for the canonical entity page.
 *
 * Given the resolved entity, render its content. A body never sees the route
 * params — only the entity the shell already resolved and `onOpen`, which is
 * where the shell sends a followed reference — so a body cannot decide what
 * the page is about or navigate anywhere the shell did not choose
 * (docs/decisions/canonical-entity-routes.md §6).
 */
export type EntityDetailBody = (props: {
  projectId: string;
  entity: Entity;
  onOpen: (referenced: Entity) => void;
}) => ReactNode;

/**
 * One line per type that has grown a detail surface worth showing beyond the
 * generic fallback (§6, §7). Deliberately a plain object literal — no
 * registration step, no dynamic import, no plugin point — so the full set of
 * bespoke bodies is always readable in one place.
 *
 * Each entry is an adapter, not a new component: the three bodies name their
 * entity prop differently (`character`, `mechanic`, `entity`), so the map is
 * where that difference is absorbed. Every other type takes
 * `EntityDetailFallback`.
 */
export const ENTITY_DETAIL_BODIES: Partial<Record<EntityType, EntityDetailBody>> = {
  character: ({ projectId, entity }) => (
    <CharacterDetailBody projectId={projectId} character={entity} />
  ),
  mechanic: ({ projectId, entity }) => (
    <MechanicDetailBody projectId={projectId} mechanic={entity} />
  ),
  system: ({ projectId, entity }) => <MechanicDetailBody projectId={projectId} mechanic={entity} />,
  prototype: ({ projectId, entity }) => (
    <PrototypeDetailBody projectId={projectId} entity={entity} />
  ),
  region: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  location: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  faction: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  culture: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  technology: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  event: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  hazard: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  lore: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
};
