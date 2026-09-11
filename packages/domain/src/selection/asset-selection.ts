import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireOneOf, requireText } from '../shared/validation';

/**
 * What a project decided about one asset, for one purpose.
 *
 * This is a *selection* vocabulary, and it is deliberately neither
 * `REVIEW_STATES` (`review/review-decision.ts`) nor `ASSET_STATUSES`
 * (`asset/asset.ts`). A review decision answers "has anybody read this and
 * agreed to it" — one state per target, newest wins; an asset status answers
 * "is this file still in play". Neither can say that one picture is a
 * character's portrait while another is approved costume exploration and a
 * third was turned down, all at once, which is the whole question this
 * vocabulary exists for.
 *
 * There is no `draft`: an asset nobody has decided about has no row here, the
 * same way `draft` is what no review decision at all reads as. `superseded` is
 * only ever written alongside the approval that replaced it, so that it names
 * the selection which took over rather than merely cancelling one.
 */
export const ASSET_SELECTION_STATES = ['approved', 'rejected', 'superseded'] as const;
export type AssetSelectionState = (typeof ASSET_SELECTION_STATES)[number];

export const MAX_ASSET_SELECTION_PURPOSE_LENGTH = 100;
export const MAX_ASSET_SELECTION_ACTOR_LENGTH = 200;
export const MAX_ASSET_SELECTION_NOTE_LENGTH = 2000;

/**
 * What an approval is *for* — the answer to "approved for what?".
 *
 * An asset can serve a character twice over: the portrait everyone draws from,
 * and a costume exploration kept alongside it. Both are approvals of the same
 * file for the same character, so neither the asset nor the entity is enough to
 * tell them apart; the pair is.
 *
 * `entityId` is an ordinary entity — a character, a location, a moodboard board
 * — because every context a tool actually has is one (a board *is* a
 * `moodboard` entity). `purpose` is a caller-decided label, stored and matched
 * exactly and never parsed: the same contract `ReviewTarget.anchor` has, for
 * the same reason. What counts as a purpose belongs to the surface offering it.
 */
export interface AssetSelectionContext {
  entityId: string;
  purpose: string;
}

/**
 * One deliberate act of choosing, kept forever.
 *
 * Rows are only ever inserted, like `ReviewDecision` and `EntityVersion`: the
 * current selection is read back out of the history rather than stored beside
 * it, so a rejected concept and the approval it lost to are both still there to
 * read. Nothing here touches the asset — its bytes, its status and the
 * `Generation` that produced it are untouched by every state in this file,
 * which is what makes rejection an opinion rather than a deletion.
 */
export interface AssetSelection {
  id: string;
  projectId: string;
  assetId: string;
  context: AssetSelectionContext;
  state: AssetSelectionState;
  /** Free text until authentication lands; then a user id. Never null: a choice is somebody's. */
  actor: string;
  /** Why, in the chooser's words. Optional, and shown verbatim. */
  note: string | null;
  /**
   * The approval that took over, on a `superseded` row and nothing else.
   *
   * It names the replacing *selection* rather than the replacing asset, so the
   * row answers who chose the replacement and when as well as what it was.
   */
  supersededBySelectionId: string | null;
  decidedAt: Date;
}

export interface CreateAssetSelectionInput {
  projectId: string;
  assetId: string;
  context: AssetSelectionContext;
  state: AssetSelectionState;
  actor: string;
  note?: string | null;
  supersededBySelectionId?: string | null;
}

export interface AssetSelectionFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

/** Validates a context, so a purpose is never stored blank or as whitespace. */
export function requireAssetSelectionContext(
  field: string,
  input: AssetSelectionContext,
): AssetSelectionContext {
  return {
    entityId: requireText(`${field}.entityId`, input?.entityId, 200),
    purpose: requireText(`${field}.purpose`, input?.purpose, MAX_ASSET_SELECTION_PURPOSE_LENGTH),
  };
}

export function createAssetSelection(
  input: CreateAssetSelectionInput,
  deps: AssetSelectionFactoryDeps,
): AssetSelection {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    assetId: requireText('assetId', input.assetId, 200),
    context: requireAssetSelectionContext('context', input.context),
    state: requireOneOf('state', input.state, ASSET_SELECTION_STATES),
    actor: requireText('actor', input.actor, MAX_ASSET_SELECTION_ACTOR_LENGTH),
    note: optionalText('note', input.note, MAX_ASSET_SELECTION_NOTE_LENGTH),
    supersededBySelectionId: optionalText(
      'supersededBySelectionId',
      input.supersededBySelectionId,
      200,
    ),
    decidedAt: deps.clock.now(),
  };
}

/** True when two contexts name the same entity and the same purpose. */
export function sameAssetSelectionContext(
  a: AssetSelectionContext,
  b: AssetSelectionContext,
): boolean {
  return a.entityId === b.entityId && a.purpose === b.purpose;
}

/**
 * Where each asset stands in one context: its newest decision, and nothing else.
 *
 * `selections` must be newest first, which is the order every read of these
 * rows promises. An older decision is never fallen back on — an approval that
 * was superseded does not come back into force because the approval which
 * replaced it was later rejected. Somebody has to choose again.
 */
export function latestSelectionByAsset(
  selections: readonly AssetSelection[],
): Map<string, AssetSelection> {
  const latest = new Map<string, AssetSelection>();
  for (const selection of selections) {
    if (!latest.has(selection.assetId)) latest.set(selection.assetId, selection);
  }
  return latest;
}

/**
 * The assets approved in a context right now, newest decision first.
 *
 * Plural on purpose: a context can hold more than one approved asset — three
 * costume explorations all kept — and narrowing to one is what supersession is
 * for, not something this read guesses at.
 */
export function currentAssetSelections(selections: readonly AssetSelection[]): AssetSelection[] {
  return [...latestSelectionByAsset(selections).values()].filter(
    (selection) => selection.state === 'approved',
  );
}

/**
 * What an entity currently stands behind, grouped by what each asset was
 * approved *for*.
 *
 * Takes decisions spanning several purposes — one entity's whole history, as
 * `AssetSelectionRepository.listByContextEntity` answers it — and folds each
 * purpose separately, so an asset approved as a portrait and rejected as a
 * costume is read correctly under both. A purpose with nothing approved is left
 * out rather than mapped to an empty list.
 *
 * The grouping key is the purpose itself, in a `Map`, and the per-purpose fold
 * is `currentAssetSelections`. Deliberately no composite string key: a purpose
 * is a caller-supplied label, so any delimiter chosen here would be one the data
 * is allowed to contain.
 */
export function currentAssetSelectionsByPurpose(
  selections: readonly AssetSelection[],
): Map<string, AssetSelection[]> {
  const byPurpose = new Map<string, AssetSelection[]>();
  for (const selection of selections) {
    const forPurpose = byPurpose.get(selection.context.purpose) ?? [];
    forPurpose.push(selection);
    byPurpose.set(selection.context.purpose, forPurpose);
  }

  const current = new Map<string, AssetSelection[]>();
  for (const [purpose, history] of byPurpose) {
    const approved = currentAssetSelections(history);
    if (approved.length > 0) current.set(purpose, approved);
  }

  return current;
}

/** A context's current selection, and every decision behind it. */
export interface AssetSelectionSummary {
  context: AssetSelectionContext;
  /** Approved right now, newest decision first. */
  current: AssetSelection[];
  /** Every decision recorded in this context, newest first. Nothing is left out. */
  history: AssetSelection[];
}
