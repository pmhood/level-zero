'use client';

import type { Asset, AssetSelectionContext, Entity } from '@level-zero/domain';
import { Button, EmptyState, Field, LinkIcon, Panel, Select, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { GenerationPanel, type GenerationPreset } from '@/features/generation/generation-panel';
import {
  AssetSelectionActions,
  AssetSelectionBadges,
  PurposePicker,
} from '@/features/selection/asset-selection-actions';
import { CurrentSelections } from '@/features/selection/current-selections';
import { CHARACTER_VISUAL_PURPOSES } from '@/features/selection/selection';
import { useIsCurrentSelection } from '@/features/selection/use-selection';
import { apiErrorMessage, assetContentUrl } from '@/lib/api';

import { resolveVisuals, unlinkedAssets, type CharacterVisual } from './character-visual';
import {
  useAttachVisual,
  useCharacterLinks,
  useProjectImages,
  useUnlinkCharacter,
} from './use-characters';
import { VisualCompare } from './visual-compare';

/**
 * The generative visual actions this studio is shaped around (spec section 31).
 *
 * Each is a prompt and a mode for the shared generation surface, not a flow of
 * its own: an expression sheet and an outfit variant are both a variation of an
 * existing portrait, and the studio's contribution is knowing what to ask for.
 */
const VISUAL_PRESETS: readonly GenerationPreset[] = [
  {
    label: 'Generate Portrait',
    mode: 'generate',
    prompt: 'Character portrait: head and shoulders, neutral key light, concept-art finish.',
  },
  {
    label: 'Expression Sheet',
    mode: 'variation',
    prompt: 'Expression sheet: the same face across neutral, angry, afraid and amused.',
  },
  {
    label: 'Outfit Variants',
    mode: 'variation',
    prompt: 'Outfit variants: three alternative costumes for the same character.',
  },
  {
    label: 'Turnaround',
    mode: 'variation',
    prompt: 'Turnaround: front, three-quarter, side and back views of the same character.',
  },
  {
    label: 'Pose Sheet',
    mode: 'variation',
    prompt: 'Pose sheet: four action poses that read at silhouette scale.',
  },
  {
    label: '3D Concept',
    mode: 'generate',
    prompt: '3D concept: orthographic views with material callouts, ready to sculpt from.',
  },
];

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
  const attach = useAttachVisual(projectId);
  const [comparing, setComparing] = useState(false);
  // What a decision on this tab is *for*. One picker rather than one per tile:
  // a studio session is usually spent choosing a portrait, then costumes.
  const [purpose, setPurpose] = useState(CHARACTER_VISUAL_PURPOSES[0]!.value);

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
  // A picture whose asset no longer resolves has nothing to put in a pane.
  const comparable = visuals
    .map((visual) => visual.asset)
    .filter((asset): asset is Asset => asset !== null);

  const context: AssetSelectionContext = { entityId: character.id, purpose };
  // A portrait is the one picture that stands for the character, so choosing a
  // new one supersedes the old. The other purposes hold several at once.
  const replaceCurrent = purpose === 'portrait';

  if (comparing && comparable.length >= 2) {
    return (
      <VisualCompare
        projectId={projectId}
        images={comparable}
        context={context}
        replaceCurrent={replaceCurrent}
        onClose={() => setComparing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CurrentSelections projectId={projectId} entity={character} />

      {!archived && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PurposePicker
            id="character-visual-purpose"
            purposes={CHARACTER_VISUAL_PURPOSES}
            value={purpose}
            onChange={setPurpose}
          />
          <p className="text-xs text-faint-foreground">
            Approving records who chose it and what for. Nothing here changes a file.
          </p>
        </div>
      )}

      {!archived && (
        <GenerationPanel
          projectId={projectId}
          contextEntities={[character]}
          referenceAssets={assets}
          presets={VISUAL_PRESETS}
          onUseResult={(asset) => attach.mutate({ character, asset })}
          useResultLabel={`Link to ${character.name}`}
          selectionContext={context}
          replaceCurrentSelection={replaceCurrent}
        />
      )}

      {attach.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(attach.error, 'Could not link that image.')}
        </p>
      )}

      {comparable.length >= 2 && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setComparing(true)}>
            Compare two images
          </Button>
        </div>
      )}

      {visuals.length === 0 ? (
        <EmptyState
          title="No visuals yet"
          description="Generate one above, or link an image the project already holds."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {visuals.map((visual) => (
            <li key={visual.relationshipId}>
              <VisualTile
                projectId={projectId}
                visual={visual}
                context={context}
                replaceCurrent={replaceCurrent}
                decidable={!archived}
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
  context,
  replaceCurrent,
  decidable,
  unlinkable,
  unlinking,
  onUnlink,
}: {
  projectId: string;
  visual: CharacterVisual;
  context: AssetSelectionContext;
  replaceCurrent: boolean;
  decidable: boolean;
  unlinkable: boolean;
  unlinking: boolean;
  onUnlink: () => void;
}) {
  const { asset, reference } = visual;
  const isCurrent = useIsCurrentSelection(projectId, asset?.id ?? '', context);

  return (
    // The chosen picture is bordered in the success tone rather than the blue
    // `Card` ring, which already means "the thing you are inspecting".
    <Panel className={isCurrent ? 'overflow-hidden border-success' : 'overflow-hidden'}>
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

        {asset && (
          <div className="mt-2">
            <AssetSelectionBadges projectId={projectId} asset={asset} context={context} />
          </div>
        )}

        {asset && decidable && (
          <div className="mt-2">
            <AssetSelectionActions
              projectId={projectId}
              asset={asset}
              context={context}
              replaceCurrent={replaceCurrent}
            />
          </div>
        )}

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
