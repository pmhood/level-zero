'use client';

import type { Asset, AssetMarkKind, AssetSelectionContext } from '@level-zero/domain';
import { Button, CheckIcon, Select, StarIcon, StatusBadge, Tag } from '@level-zero/ui';

import { ACTING_AS } from '@/features/review/review';
import { apiErrorMessage } from '@/lib/api';

import {
  assetMarkLabel,
  assetSelectionBadge,
  purposeLabel,
  selectionFor,
  type AssetPurpose,
} from './selection';
import {
  useApproveAsset,
  useAssetMarks,
  useAssetSelectionSummary,
  useRejectAsset,
  useToggleAssetMark,
} from './use-selection';

export interface AssetSelectionActionsProps {
  projectId: string;
  asset: Asset;
  /** What a decision here would be about: the entity, and what for. */
  context: AssetSelectionContext;
  /**
   * True where the purpose holds one visual — a portrait — so approving
   * supersedes whatever it replaces instead of joining it. False where several
   * can stand at once, which is what costume exploration is for.
   */
  replaceCurrent?: boolean;
}

/**
 * Fast triage for one asset: favourite, shortlist, approve, reject.
 *
 * These are ordinary decisions, not generative ones, so nothing here is purple
 * however much AI output surrounds it. They are also compact on purpose: a grid
 * of results shows this row per tile, and the loud action on that screen is the
 * one that generates more.
 *
 * Every tile in a grid shares one read of the context and one of the project's
 * marks, because they all ask for the same two cache keys.
 */
export function AssetSelectionActions({
  projectId,
  asset,
  context,
  replaceCurrent = false,
}: AssetSelectionActionsProps) {
  const summary = useAssetSelectionSummary(projectId, context);
  const marks = useAssetMarks(projectId);
  const approve = useApproveAsset(projectId);
  const reject = useRejectAsset(projectId);
  const toggleMark = useToggleAssetMark(projectId);

  const current = summary.data?.current ?? [];
  const selection = selectionFor(summary.data?.history ?? [], asset.id);
  const isCurrent = current.some((approved) => approved.assetId === asset.id);
  const busy = approve.isPending || reject.isPending || summary.isPending;

  const error = approve.error ?? reject.error ?? toggleMark.error;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MarkButton
          kind="favorite"
          asset={asset}
          marked={isMarked(marks.data, asset.id, 'favorite')}
          pending={toggleMark.isPending}
          onToggle={(marked) =>
            toggleMark.mutate({ assetId: asset.id, kind: 'favorite', marked, actor: ACTING_AS })
          }
        />
        <MarkButton
          kind="shortlisted"
          asset={asset}
          marked={isMarked(marks.data, asset.id, 'shortlisted')}
          pending={toggleMark.isPending}
          onToggle={(marked) =>
            toggleMark.mutate({ assetId: asset.id, kind: 'shortlisted', marked, actor: ACTING_AS })
          }
        />

        {!isCurrent && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              approve.mutate({
                assetId: asset.id,
                entityId: context.entityId,
                purpose: context.purpose,
                actor: ACTING_AS,
                // Naming what this replaces is what makes the old choice
                // `superseded` and not merely un-approved.
                ...(replaceCurrent
                  ? { supersedes: current.map((approved) => approved.assetId) }
                  : {}),
              })
            }
          >
            <CheckIcon className="size-4" />
            {approveLabel(context.purpose, replaceCurrent, current.length > 0)}
          </Button>
        )}

        {selection?.state !== 'rejected' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              reject.mutate({
                assetId: asset.id,
                entityId: context.entityId,
                purpose: context.purpose,
                actor: ACTING_AS,
              })
            }
          >
            Reject
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-error">
          {apiErrorMessage(error, 'Could not record that decision.')}
        </p>
      )}
    </div>
  );
}

/**
 * Where one asset stands: the marks somebody put on it, and the decision in
 * force for this context.
 *
 * Never colour alone (spec §19) — the badge always carries its label, and the
 * label names the purpose so "approved for what?" reads off the tile.
 */
export function AssetSelectionBadges({
  projectId,
  asset,
  context,
}: {
  projectId: string;
  asset: Asset;
  context: AssetSelectionContext;
}) {
  const summary = useAssetSelectionSummary(projectId, context);
  const marks = useAssetMarks(projectId);

  const selection = selectionFor(summary.data?.history ?? [], asset.id);
  const isCurrent = (summary.data?.current ?? []).some((approved) => approved.assetId === asset.id);
  const marked = (marks.data ?? []).filter((mark) => mark.assetId === asset.id);

  if (!selection && marked.length === 0) return null;

  const badge = selection ? assetSelectionBadge(selection.state) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badge && selection && (
        <StatusBadge tone={badge.tone}>
          {isCurrent ? `Current ${purposeLabel(context.purpose).toLowerCase()}` : badge.label}
        </StatusBadge>
      )}
      {marked.map((mark) => (
        <Tag key={mark.id}>{assetMarkLabel(mark.kind)}</Tag>
      ))}
    </div>
  );
}

/** The purpose picker a surface offers above a grid it is triaging. */
export function PurposePicker({
  purposes,
  value,
  onChange,
  id,
}: {
  purposes: readonly AssetPurpose[];
  value: string;
  onChange: (purpose: string) => void;
  id: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-faint-foreground">
        Deciding as
      </label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {purposes.map((purpose) => (
          <option key={purpose.value} value={purpose.value}>
            {purpose.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function MarkButton({
  kind,
  asset,
  marked,
  pending,
  onToggle,
}: {
  kind: AssetMarkKind;
  asset: Asset;
  marked: boolean;
  pending: boolean;
  onToggle: (marked: boolean) => void;
}) {
  const label = assetMarkLabel(kind);

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={marked}
      aria-label={`${marked ? 'Remove' : 'Add'} ${label.toLowerCase()} on ${asset.filename}`}
      disabled={pending}
      onClick={() => onToggle(!marked)}
    >
      {kind === 'favorite' ? (
        <StarIcon className="size-4" fill={marked ? 'currentColor' : 'none'} />
      ) : (
        <span>{marked ? 'Shortlisted' : 'Shortlist'}</span>
      )}
    </Button>
  );
}

function isMarked(
  marks: readonly { assetId: string; kind: AssetMarkKind }[] | undefined,
  assetId: string,
  kind: AssetMarkKind,
): boolean {
  return (marks ?? []).some((mark) => mark.assetId === assetId && mark.kind === kind);
}

function approveLabel(purpose: string, replaceCurrent: boolean, hasCurrent: boolean): string {
  const named = purposeLabel(purpose).toLowerCase();
  return replaceCurrent && hasCurrent ? `Make current ${named}` : `Approve as ${named}`;
}
