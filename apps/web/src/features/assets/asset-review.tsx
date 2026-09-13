'use client';

import {
  summarizeCurrentSelections,
  type Asset,
  type AssetLinkedEntity,
  type AssetSelectionContext,
} from '@level-zero/domain';
import { Field, Select, StatusBadge } from '@level-zero/ui';
import { useState } from 'react';

import {
  AssetSelectionActions,
  AssetSelectionBadges,
  PurposePicker,
} from '@/features/selection/asset-selection-actions';
import {
  assetSelectionBadge,
  purposeLabel,
  visualPurposesFor,
  type AssetPurpose,
} from '@/features/selection/selection';
import { useAssetSelectionHistory } from '@/features/selection/use-selection';

/**
 * Deciding about a file from the library, which has no context of its own.
 *
 * Approval is always "approved *for* something" — an entity and a purpose —
 * and the same file can be the portrait for one character and a rejected
 * costume take for another. A grid of every asset in the project knows neither
 * half, so this asks for both rather than inventing a project-wide approval
 * that the model does not have.
 *
 * The entities offered are the ones that already reference this file: linking
 * is how an asset enters a workspace, and approving a file for a character it
 * is not linked to would be a decision about nothing.
 */
export function AssetReview({
  projectId,
  asset,
  linkedEntities,
}: {
  projectId: string;
  asset: Asset;
  linkedEntities: readonly AssetLinkedEntity[];
}) {
  const [chosenEntityId, setChosenEntityId] = useState<string | null>(null);
  const [chosenPurpose, setChosenPurpose] = useState<string | null>(null);

  const entity =
    linkedEntities.find((candidate) => candidate.entityId === chosenEntityId) ?? linkedEntities[0];
  const purposes = entity ? visualPurposesFor(entity.type) : [];
  // Switching entity can change the vocabulary, so the chosen purpose is only
  // kept while the new list still offers it — derived rather than synchronised.
  const purpose =
    purposes.find((candidate) => candidate.value === chosenPurpose)?.value ??
    purposes[0]?.value ??
    '';

  return (
    <section aria-label="Review" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-foreground">Review</h3>

      <CurrentStates projectId={projectId} asset={asset} linkedEntities={linkedEntities} />

      {entity && purpose ? (
        <Decide
          projectId={projectId}
          asset={asset}
          entity={entity}
          entities={linkedEntities}
          purposes={purposes}
          purpose={purpose}
          onEntityChange={setChosenEntityId}
          onPurposeChange={setChosenPurpose}
        />
      ) : (
        <p className="text-xs text-faint-foreground">
          Link this file to a character, board or location first — a decision here is always a
          decision for something.
        </p>
      )}
    </section>
  );
}

function Decide({
  projectId,
  asset,
  entity,
  entities,
  purposes,
  purpose,
  onEntityChange,
  onPurposeChange,
}: {
  projectId: string;
  asset: Asset;
  entity: AssetLinkedEntity;
  entities: readonly AssetLinkedEntity[];
  purposes: readonly AssetPurpose[];
  purpose: string;
  onEntityChange: (entityId: string) => void;
  onPurposeChange: (purpose: string) => void;
}) {
  const context: AssetSelectionContext = { entityId: entity.entityId, purpose };
  // A portrait is the one picture that stands for its subject, so choosing a
  // new one supersedes the old — the rule Character Studio already applies.
  const replaceCurrent = purpose === 'portrait';

  return (
    <div className="flex flex-col gap-2">
      <Field label="Deciding for" htmlFor="asset-review-entity">
        <Select
          id="asset-review-entity"
          value={entity.entityId}
          onChange={(event) => onEntityChange(event.target.value)}
        >
          {entities.map((candidate) => (
            <option key={candidate.entityId} value={candidate.entityId}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </Field>

      <PurposePicker
        id="asset-review-purpose"
        purposes={purposes}
        value={purpose}
        onChange={onPurposeChange}
      />

      <AssetSelectionBadges projectId={projectId} asset={asset} context={context} />
      <AssetSelectionActions
        projectId={projectId}
        asset={asset}
        context={context}
        replaceCurrent={replaceCurrent}
      />
    </div>
  );
}

/**
 * Where this file stands in every context it was considered for — the same
 * fold the library summary applies, read live so a decision made here changes
 * the list under it.
 */
function CurrentStates({
  projectId,
  asset,
  linkedEntities,
}: {
  projectId: string;
  asset: Asset;
  linkedEntities: readonly AssetLinkedEntity[];
}) {
  const history = useAssetSelectionHistory(projectId, asset.id);
  const current = summarizeCurrentSelections(history.data ?? []).get(asset.id) ?? [];
  if (current.length === 0) return null;

  const names = new Map(linkedEntities.map((entity) => [entity.entityId, entity.name]));

  return (
    <ul className="flex flex-col gap-1">
      {current.map((entry) => (
        <li
          key={`${entry.context.entityId}:${entry.context.purpose}`}
          className="flex flex-wrap items-center gap-1.5"
        >
          <StatusBadge tone={assetSelectionBadge(entry.state).tone}>
            {assetSelectionBadge(entry.state).label}
          </StatusBadge>
          <span className="text-xs text-muted-foreground">
            as {purposeLabel(entry.context.purpose).toLowerCase()}
            {names.has(entry.context.entityId) && ` for ${names.get(entry.context.entityId)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
