'use client';

import { referencedAssetId, type Asset, type Entity } from '@level-zero/domain';
import { Button, EmptyState, Panel } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import * as api from '@/lib/api';

import {
  AssetSelectionActions,
  AssetSelectionBadges,
  PurposePicker,
} from './asset-selection-actions';
import { CurrentSelections } from './current-selections';
import type { AssetPurpose } from './selection';
import { useIsCurrentSelection } from './use-selection';

/**
 * The pictures an entity points at, and the decisions taken about them.
 *
 * Whatever is linked through an `asset_reference` edge is a candidate; which of
 * them the project has actually chosen is the selection history, read and
 * written here. Nothing on this surface links, unlinks, uploads or deletes — the
 * relationship view owns the linking, and this owns the choosing.
 */
export function EntityVisualDecisions({
  projectId,
  entity,
  purposes,
}: {
  projectId: string;
  entity: Entity;
  /** The purposes this kind of entity's visuals can be approved for. */
  purposes: readonly AssetPurpose[];
}) {
  const [purpose, setPurpose] = useState(purposes[0]?.value ?? '');
  const linked = useLinkedAssets(projectId, entity.id);

  const context = { entityId: entity.id, purpose };
  const decidable = entity.status !== 'archived';

  return (
    <div className="flex flex-col gap-5">
      <CurrentSelections projectId={projectId} entity={entity} />

      {decidable && (
        <PurposePicker
          id={`entity-visual-purpose-${entity.id}`}
          purposes={purposes}
          value={purpose}
          onChange={setPurpose}
        />
      )}

      {linked.isPending && <p className="text-sm text-muted-foreground">Loading pictures…</p>}

      {linked.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-error">{api.apiErrorMessage(linked.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void linked.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {linked.data?.length === 0 && (
        <EmptyState
          title="No pictures linked"
          description="Link an asset reference from the relationships view, then choose what it is for here."
        />
      )}

      {linked.data && linked.data.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {linked.data.map((asset) => (
            <li key={asset.id}>
              <VisualCandidate
                projectId={projectId}
                asset={asset}
                context={context}
                decidable={decidable}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VisualCandidate({
  projectId,
  asset,
  context,
  decidable,
}: {
  projectId: string;
  asset: Asset;
  context: { entityId: string; purpose: string };
  decidable: boolean;
}) {
  const isCurrent = useIsCurrentSelection(projectId, asset.id, context);

  return (
    // Success-toned border for the chosen one, never the blue `Card` ring: that
    // already means "the thing you are inspecting".
    <Panel className={isCurrent ? 'overflow-hidden border-success' : 'overflow-hidden'}>
      {/* 16:9, the ratio the spec gives location imagery (section 13). */}
      <div className="flex aspect-video items-center justify-center bg-raised">
        <img
          src={api.assetContentUrl(projectId, asset.id)}
          alt={asset.filename}
          className="size-full object-cover"
        />
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p className="truncate text-[13px] font-medium text-foreground">{asset.filename}</p>
        <AssetSelectionBadges projectId={projectId} asset={asset} context={context} />
        {decidable && (
          <AssetSelectionActions projectId={projectId} asset={asset} context={context} />
        )}
      </div>
    </Panel>
  );
}

/**
 * The assets this entity's `asset_reference` edges point at.
 *
 * An edge whose asset no longer resolves is left out rather than rendered as a
 * broken tile: this surface is for choosing between pictures, and the
 * relationship view is where a broken link is visible and fixable.
 */
function useLinkedAssets(projectId: string, entityId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', entityId, 'linked-assets'],
    queryFn: async (): Promise<Asset[]> => {
      const [links, images] = await Promise.all([
        api.getEntityNeighborhood(projectId, entityId, { direction: 'outgoing' }),
        api.listAssets(projectId, { kind: ['image'], limit: 200 }),
      ]);

      const byId = new Map(images.items.map((asset) => [asset.id, asset]));
      return links.outgoing
        .map((edge) => referencedAssetId(edge.entity))
        .flatMap((assetId) => {
          const asset = assetId === null ? undefined : byId.get(assetId);
          return asset ? [asset] : [];
        });
    },
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}
