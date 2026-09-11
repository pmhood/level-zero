'use client';

import {
  currentAssetSelectionsByPurpose,
  type AssetSelection,
  type Entity,
} from '@level-zero/domain';
import { Button, EmptyState, SectionPanel, StatusBadge } from '@level-zero/ui';

import { formatDecidedAt } from '@/features/review/review';
import { apiErrorMessage, assetContentUrl } from '@/lib/api';

import { assetSelectionBadge, purposeLabel } from './selection';
import { useEntityAssetSelections } from './use-selection';

/**
 * What this entity currently stands behind, and every decision that got it
 * there.
 *
 * The chosen visuals come first and are bordered in the success tone with a
 * badge naming the purpose, so the canonical picture reads apart from the
 * exploration set around it. Underneath is the whole history, rejections and
 * supersessions included: nothing is deleted here, so a concept that lost is
 * still there to look at, with the choice that replaced it named.
 *
 * Plural throughout. A character can have an approved portrait *and* two
 * approved costume explorations, and flattening that to one "current image"
 * would be the thing the selection model exists to avoid.
 */
export function CurrentSelections({
  projectId,
  entity,
  title = 'Chosen visuals',
}: {
  projectId: string;
  entity: Entity;
  title?: string;
}) {
  const selections = useEntityAssetSelections(projectId, entity.id);

  if (selections.isPending) {
    return (
      <SectionPanel title={title}>
        <p className="text-sm text-muted-foreground">Loading selections…</p>
      </SectionPanel>
    );
  }

  if (selections.isError) {
    return (
      <SectionPanel title={title}>
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-error">{apiErrorMessage(selections.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void selections.refetch()}>
            Try again
          </Button>
        </div>
      </SectionPanel>
    );
  }

  const history = selections.data;
  const chosen = [...currentAssetSelectionsByPurpose(history).entries()];

  return (
    <SectionPanel
      title={title}
      description={`What ${entity.name} currently stands behind, and how it was decided.`}
    >
      <div className="flex flex-col gap-5">
        {chosen.length === 0 ? (
          <EmptyState
            title="Nothing chosen yet"
            description="Generating a picture does not choose it. Approve one for a purpose and it appears here."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {chosen.map(([purpose, approved]) => (
              <li key={purpose} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge tone="success">{purposeLabel(purpose)}</StatusBadge>
                  <span className="text-xs text-faint-foreground">
                    {approved.length === 1 ? '1 approved' : `${approved.length} approved`}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-3">
                  {approved.map((selection) => (
                    <li key={selection.id}>
                      <ChosenVisual projectId={projectId} selection={selection} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {history.length > 0 && (
          <section aria-label="Selection history" className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold text-foreground">Decision history</h4>
            <ul className="flex flex-col gap-2">
              {history.map((selection) => (
                <li key={selection.id}>
                  <DecisionRow projectId={projectId} selection={selection} history={history} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </SectionPanel>
  );
}

/**
 * One approved picture, bordered in the success tone.
 *
 * Deliberately not the blue `Card` selected ring: that already means "the thing
 * you are inspecting", and this means "the thing the project chose".
 */
function ChosenVisual({ projectId, selection }: { projectId: string; selection: AssetSelection }) {
  return (
    <figure className="w-28 overflow-hidden rounded-lg border border-success bg-raised">
      <img
        src={assetContentUrl(projectId, selection.assetId)}
        alt={`Approved ${purposeLabel(selection.context.purpose).toLowerCase()}`}
        className="aspect-[4/5] w-full object-cover"
      />
      <figcaption className="px-2 py-1.5 text-[11px] text-faint-foreground">
        {selection.actor} · {formatDecidedAt(selection.decidedAt)}
      </figcaption>
    </figure>
  );
}

/** One row of the history, with the replacement named where there is one. */
function DecisionRow({
  projectId,
  selection,
  history,
}: {
  projectId: string;
  selection: AssetSelection;
  history: readonly AssetSelection[];
}) {
  const badge = assetSelectionBadge(selection.state);
  const replacement =
    selection.supersededBySelectionId === null
      ? null
      : (history.find((other) => other.id === selection.supersededBySelectionId) ?? null);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface p-2">
      <img
        src={assetContentUrl(projectId, selection.assetId)}
        alt=""
        className="size-10 shrink-0 rounded object-cover"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          <span className="text-xs text-muted-foreground">
            as {purposeLabel(selection.context.purpose).toLowerCase()}
          </span>
        </div>
        <p className="text-xs text-faint-foreground">
          {selection.actor} · {formatDecidedAt(selection.decidedAt)}
        </p>
        {selection.note && <p className="text-xs text-muted-foreground">{selection.note}</p>}
        {replacement && (
          <p className="flex items-center gap-1.5 text-xs text-faint-foreground">
            Replaced by
            <img
              src={assetContentUrl(projectId, replacement.assetId)}
              alt=""
              className="size-6 rounded object-cover"
            />
            {replacement.actor}&apos;s choice
          </p>
        )}
      </div>
    </div>
  );
}
