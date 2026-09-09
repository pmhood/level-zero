'use client';

import type { Asset, Entity } from '@level-zero/domain';
import { Button, EmptyState, Field, LinkIcon, Panel, Select, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { apiErrorMessage, assetContentUrl } from '@/lib/api';

import { SparklesIcon } from './character-icons';
import { resolveVisuals, unlinkedAssets, type CharacterVisual } from './character-visual';
import {
  useAttachVisual,
  useCharacterLinks,
  useProjectImages,
  useUnlinkCharacter,
} from './use-characters';

/**
 * The generative visual actions this studio is shaped around (spec section 31).
 *
 * They are listed, and deliberately not wired: the reusable generation surface
 * — prompt, provider, progress, provenance and promoting a result to a
 * canonical asset — is issue #47's, and a second one built here would be the
 * parallel implementation that issue exists to prevent.
 */
const VISUAL_ACTIONS = [
  'Generate Portrait',
  'Expression Sheet',
  'Outfit Variants',
  'Turnaround',
  'Pose Sheet',
  '3D Concept',
] as const;

/**
 * The character's pictures.
 *
 * Every tile is a reusable `Asset`, reached through an `asset_reference`
 * entity and an ordinary edge — so the same portrait can hang in a moodboard
 * and sit in the GDD, and unlinking it here costs one edge rather than a file.
 */
export function CharacterVisuals({
  projectId,
  character,
}: {
  projectId: string;
  character: Entity;
}) {
  const links = useCharacterLinks(projectId, character.id);
  const images = useProjectImages(projectId);
  const unlink = useUnlinkCharacter(projectId);

  if (links.isPending || images.isPending) {
    return <p className="text-sm text-muted-foreground">Loading visuals…</p>;
  }

  if (links.isError || images.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{apiErrorMessage(links.error ?? images.error)}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void links.refetch();
            void images.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const assets = images.data.items;
  const visuals = resolveVisuals(links.data.outgoing, assets);
  const archived = character.status === 'archived';

  return (
    <div className="flex flex-col gap-5">
      <VisualActions />

      {visuals.length === 0 ? (
        <EmptyState
          title="No visuals yet"
          description="Link an image the project already holds, or generate one once the asset workspace lands."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {visuals.map((visual) => (
            <li key={visual.relationshipId}>
              <VisualTile
                projectId={projectId}
                visual={visual}
                unlinkable={!archived}
                unlinking={unlink.isPending}
                onUnlink={() =>
                  unlink.mutate({
                    entityId: character.id,
                    relationshipId: visual.relationshipId,
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {unlink.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(unlink.error, 'Could not unlink that visual.')}
        </p>
      )}

      {archived ? (
        <p className="text-xs text-faint-foreground">
          Restore this character to change its visuals. The links themselves are intact.
        </p>
      ) : (
        <LinkVisualForm
          projectId={projectId}
          character={character}
          candidates={unlinkedAssets(assets, visuals)}
        />
      )}
    </div>
  );
}

/** Purple, and disabled: AI actions read as AI, and none of these run yet. */
function VisualActions() {
  return (
    <Field
      label="Generate"
      hint="Visual generation arrives with the asset generation workspace. Until then, link an image the project already holds."
    >
      <div className="flex flex-wrap gap-2">
        {VISUAL_ACTIONS.map((action) => (
          <Button key={action} type="button" variant="ai" size="sm" disabled>
            <SparklesIcon className="size-4" />
            {action}
          </Button>
        ))}
      </div>
    </Field>
  );
}

/**
 * One picture, at the 4:5 the spec gives character imagery (section 13).
 *
 * A reference whose asset has gone — deleted, or never resolvable — keeps its
 * tile and says so, because a broken link is something to fix rather than
 * something to hide.
 */
function VisualTile({
  projectId,
  visual,
  unlinkable,
  unlinking,
  onUnlink,
}: {
  projectId: string;
  visual: CharacterVisual;
  unlinkable: boolean;
  unlinking: boolean;
  onUnlink: () => void;
}) {
  const { asset, reference } = visual;

  return (
    <Panel className="overflow-hidden">
      <div className="flex aspect-[4/5] items-center justify-center bg-raised">
        {asset ? (
          <img
            src={assetContentUrl(projectId, asset.id)}
            alt={asset.filename}
            className="size-full object-cover"
          />
        ) : (
          <p className="px-3 text-center text-xs text-faint-foreground">Image unavailable</p>
        )}
      </div>

      <div className="p-3">
        <p className="truncate text-[13px] font-medium text-foreground">
          {asset?.filename ?? reference.name}
        </p>
        <p className="mt-0.5 text-xs text-faint-foreground">
          {asset ? `${asset.variant} · ${asset.kind}` : 'Missing asset'}
        </p>

        <div className="mt-2 flex items-center gap-1.5">
          {!asset && <Tag>Missing</Tag>}
          {asset?.status === 'archived' && <Tag>Archived</Tag>}
          {unlinkable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={unlinking}
              onClick={onUnlink}
              aria-label={`Unlink ${asset?.filename ?? reference.name}`}
            >
              Unlink
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function LinkVisualForm({
  projectId,
  character,
  candidates,
}: {
  projectId: string;
  character: Entity;
  candidates: Asset[];
}) {
  const [assetId, setAssetId] = useState('');
  const attach = useAttachVisual(projectId);

  const chosen = candidates.find((candidate) => candidate.id === assetId);

  return (
    <form
      className="flex flex-col gap-2 border-t border-border-subtle pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosen) return;
        attach.mutate({ character, asset: chosen }, { onSuccess: () => setAssetId('') });
      }}
    >
      <Field
        label="Link an existing image"
        hint="Assets are shared. Linking one here never copies the file."
      >
        <Select
          aria-label="Image to link"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
        >
          <option value="">Choose an image…</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.filename}
            </option>
          ))}
        </Select>
      </Field>

      {candidates.length === 0 && (
        <p className="text-xs text-faint-foreground">
          Every image in this project is already linked here.
        </p>
      )}

      {attach.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(attach.error, 'Could not link that image.')}
        </p>
      )}

      <Button type="submit" size="sm" variant="secondary" disabled={!chosen || attach.isPending}>
        <LinkIcon className="size-4" />
        {attach.isPending ? 'Linking…' : 'Link image'}
      </Button>
    </form>
  );
}
