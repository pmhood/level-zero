'use client';

import type { Entity } from '@level-zero/domain';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { resolveEntityReference, type ResolvedEntityReference } from './entity-reference';

interface EntityReferenceContextValue {
  /** The project's referenceable entities, archived ones included so old references still resolve. */
  entities: Entity[];
  isPending: boolean;
  /** Opening the canonical entity the reference points at. */
  onOpen: (entity: Entity) => void;
  /**
   * Lets a reference offer a contextual entry point to the Consistency
   * surface for the entity it names. Optional, and left unset by callers
   * that predate that surface (and by tests), in which case a reference
   * renders exactly as it did before.
   */
  projectId?: string;
}

/**
 * References render inside the editor's node views, which sit far below the
 * workspace that fetched the entities — a context is how the two meet.
 *
 * The empty default matters: a reference rendered outside a provider shows as
 * a broken reference rather than throwing inside the document.
 */
const EntityReferenceContext = createContext<EntityReferenceContextValue>({
  entities: [],
  isPending: false,
  onOpen: () => {},
});

export function EntityReferenceProvider({
  entities,
  isPending,
  onOpen,
  projectId,
  children,
}: EntityReferenceContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ entities, isPending, onOpen, projectId }),
    [entities, isPending, onOpen, projectId],
  );

  return <EntityReferenceContext value={value}>{children}</EntityReferenceContext>;
}

export function useEntityReferences(): EntityReferenceContextValue {
  return useContext(EntityReferenceContext);
}

/**
 * Resolves one reference against the entities as they are *now*.
 *
 * This is what keeps a rename out of the document: the stored JSON only ever
 * held the id, so a new name arriving from the API re-renders the chip and
 * leaves the document untouched.
 */
export function useResolvedEntity(entityId: string | null): ResolvedEntityReference {
  const { entities, isPending } = useEntityReferences();

  return useMemo(
    () => resolveEntityReference(entityId, entities, isPending),
    [entityId, entities, isPending],
  );
}
