import type { Entity, EntityType } from '@level-zero/domain';
import type { ReactNode } from 'react';

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
 * generic fallback (§6, §12). Deliberately a plain object literal — no
 * registration step, no dynamic import, no plugin point — so the full set of
 * bespoke bodies is always readable in one place.
 *
 * Empty for now: the bespoke bodies are a follow-up issue. Every type takes
 * `EntityDetailFallback` until then.
 */
export const ENTITY_DETAIL_BODIES: Partial<Record<EntityType, EntityDetailBody>> = {};
