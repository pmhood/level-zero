'use client';

import {
  assetReferenceData,
  referencedAssetId,
  type Asset,
  type CreateEntityInput,
  type Entity,
  type UpdateEntityInput,
} from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

import { CHARACTER_ENTITY_TYPE, lifecycleStatuses, type CharacterLifecycle } from './character';
import { VISUAL_RELATION } from './character-visual';

export interface CharacterFilters {
  lifecycle: CharacterLifecycle;
  search?: string;
}

const characterKeys = {
  all: (projectId: string) => ['projects', projectId, 'characters'] as const,
  list: (projectId: string, filters: CharacterFilters) =>
    ['projects', projectId, 'characters', 'list', filters] as const,
  entity: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId] as const,
  links: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'relationships'] as const,
  history: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'versions'] as const,
  images: (projectId: string) => ['projects', projectId, 'assets', 'image'] as const,
};

/**
 * Characters are `Entity` rows of type `character`.
 *
 * Lifecycle and free-text search are columns the listing endpoint can filter;
 * role and tag are narrowed in the browser so its own filter options stay
 * stable (see `narrowCharacters`).
 */
export function useCharacters(projectId: string, filters: CharacterFilters) {
  return useQuery({
    queryKey: characterKeys.list(projectId, filters),
    queryFn: () =>
      api.listEntities(projectId, {
        type: [CHARACTER_ENTITY_TYPE],
        status: lifecycleStatuses(filters.lifecycle),
        search: filters.search,
        limit: 100,
      }),
    enabled: Boolean(projectId),
  });
}

/** The selected character, read by id so an edit elsewhere is reflected here. */
export function useCharacter(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: characterKeys.entity(projectId, entityId ?? ''),
    queryFn: () => api.getEntity(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** Everything one hop from a character: its visuals and its relationships alike. */
export function useCharacterLinks(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: characterKeys.links(projectId, entityId ?? ''),
    queryFn: () => api.getEntityNeighborhood(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function useCharacterHistory(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: characterKeys.history(projectId, entityId ?? ''),
    queryFn: () => api.getEntityHistory(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/**
 * The project's images, fetched once and joined to the character's asset
 * references in the client — one request instead of one per visual.
 */
export function useProjectImages(projectId: string) {
  return useQuery({
    queryKey: characterKeys.images(projectId),
    queryFn: () => api.listAssets(projectId, { kind: ['image'], limit: 200 }),
    enabled: Boolean(projectId),
  });
}

/** Invalidates the list and one character — every mutation below settles this way. */
function useCharacterInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return (entityId?: string) => {
    queryClient.invalidateQueries({ queryKey: characterKeys.all(projectId) });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: characterKeys.entity(projectId, entityId) });
    }
  };
}

export function useCreateCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: (input: Omit<CreateEntityInput, 'projectId' | 'type'>) =>
      api.createEntity(projectId, { ...input, type: CHARACTER_ENTITY_TYPE }),
    onSuccess: (character) => invalidate(character.id),
  });
}

export function useUpdateCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: UpdateEntityInput }) =>
      api.updateEntity(projectId, entityId, patch),
    onSuccess: (character) => invalidate(character.id),
  });
}

/**
 * Autosaves one of a character's documents — the background, the notes.
 *
 * `data` is replaced wholesale by the API, so the rest of it is carried over.
 * Nothing else on screen renders these, so unlike the other mutations this
 * does not invalidate anything mid-sentence.
 */
export function useSaveCharacterDocument(projectId: string, field: string) {
  return useMutation({
    mutationFn: ({ character, content }: { character: Entity; content: JSONContent }) =>
      api.updateEntity(projectId, character.id, {
        data: { ...character.data, [field]: content },
      }),
  });
}

export function useArchiveCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.archiveEntity(projectId, entityId),
    onSuccess: (character) => invalidate(character.id),
  });
}

export function useRestoreCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: (character) => invalidate(character.id),
  });
}

export function useLinkCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, input }: { entityId: string; input: api.CreateRelationshipInput }) =>
      api.createRelationship(projectId, entityId, input),
    onSuccess: (_relationship, variables) => invalidate(variables.entityId),
  });
}

/** Removes one edge. Used for relationships and visuals alike — an unlinked
 * asset keeps its file and its reference entity for whoever else points at it. */
export function useUnlinkCharacter(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, relationshipId }: { entityId: string; relationshipId: string }) =>
      api.deleteRelationship(projectId, entityId, relationshipId),
    onSuccess: (_result, variables) => invalidate(variables.entityId),
  });
}

/**
 * Points a character at an existing asset.
 *
 * An `asset_reference` entity already naming that asset is reused rather than
 * duplicated: one entity per file is what lets the same portrait appear in
 * Character Studio, a moodboard and the GDD without three copies of it.
 */
export function useAttachVisual(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: async ({ character, asset }: { character: Entity; asset: Asset }) => {
      const references = await api.listEntities(projectId, {
        type: ['asset_reference'],
        includeArchived: true,
        limit: 200,
      });
      const existing = references.items.find((item) => referencedAssetId(item) === asset.id);
      const reference =
        existing ??
        (await api.createEntity(projectId, {
          type: 'asset_reference',
          name: asset.filename,
          status: 'active',
          data: assetReferenceData(asset.id),
        }));

      return api.createRelationship(projectId, character.id, {
        targetEntityId: reference.id,
        relation: VISUAL_RELATION,
      });
    },
    onSuccess: (_relationship, variables) => invalidate(variables.character.id),
  });
}

export function useCommitCharacterVersion(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) =>
      api.commitEntityVersion(projectId, entityId, { reason: 'manual' }),
    onSuccess: (version) => invalidate(version.entityId),
  });
}

export function useRestoreCharacterVersion(projectId: string) {
  const invalidate = useCharacterInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, versionId }: { entityId: string; versionId: string }) =>
      api.restoreEntityVersion(projectId, entityId, versionId),
    onSuccess: (version) => invalidate(version.entityId),
  });
}
