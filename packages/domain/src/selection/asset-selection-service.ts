import { type ReviewTargetResolver } from '../review/review-target-resolver';
import { type Clock } from '../shared/clock';
import { ConflictError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { requireOneOf, requireText } from '../shared/validation';
import {
  ASSET_MARK_KINDS,
  createAssetMark,
  type AssetMark,
  type AssetMarkKind,
} from './asset-mark';
import { type AssetMarkRepository } from './asset-mark-repository';
import {
  createAssetSelection,
  currentAssetSelections,
  latestSelectionByAsset,
  requireAssetSelectionContext,
  type AssetSelection,
  type AssetSelectionContext,
  type AssetSelectionSummary,
} from './asset-selection';
import { type AssetSelectionRepository } from './asset-selection-repository';

export interface AssetSelectionServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface MarkAssetInput {
  assetId: string;
  kind: AssetMarkKind;
  /** Free text until authentication lands; then it comes from the session. */
  actor: string;
}

export interface ApproveAssetInput {
  assetId: string;
  context: AssetSelectionContext;
  actor: string;
  note?: string | null;
  /**
   * Assets this approval replaces, each currently approved in the same context.
   *
   * Left out, the approval joins whatever is already approved — three costume
   * explorations can all stand. Named, each one is superseded by *this*
   * approval, which is how "make this the portrait" is said.
   */
  supersedes?: readonly string[];
}

export interface RejectAssetInput {
  assetId: string;
  context: AssetSelectionContext;
  actor: string;
  note?: string | null;
}

/** An approval, and the approvals it displaced. */
export interface ApproveAssetResult {
  approval: AssetSelection;
  /** One row per replaced asset, each pointing back at `approval`. */
  superseded: AssetSelection[];
}

/**
 * Which generated or imported assets a project actually chose, and what for.
 *
 * Generating something never chooses it: a finished generation leaves forty
 * pictures and no opinion, and every state here is reached only by a person
 * saying so. Nothing in this service writes to an asset, an entity or a
 * `Generation`, so provenance and parent/variation lineage read exactly the
 * same for a rejected concept as for the approved one — rejection is an opinion
 * recorded beside the file, never a deletion of it.
 *
 * Two stores, because triage and choosing are different acts. A star or a
 * shortlist is a mark in a set, added and removed freely and belonging to no
 * context. An approval is a decision with an actor, a moment and an answer to
 * "approved for what?", and it is only ever appended.
 *
 * Existence checks go through `ReviewTargetResolver` (issue #70) rather than a
 * second pair of repository lookups, so an asset or a context entity from
 * another project reads as missing here exactly as it does for a comment.
 */
export class AssetSelectionService {
  constructor(
    private readonly selections: AssetSelectionRepository,
    private readonly marks: AssetMarkRepository,
    private readonly targets: ReviewTargetResolver,
    private readonly deps: AssetSelectionServiceDeps,
  ) {}

  /** Stars or shortlists an asset. Doing it twice is the same as doing it once. */
  async mark(projectId: string, input: MarkAssetInput): Promise<AssetMark> {
    await this.requireAsset(projectId, input.assetId);

    return this.marks.add(
      createAssetMark(
        { projectId, assetId: input.assetId, kind: input.kind, actor: input.actor },
        this.deps,
      ),
    );
  }

  /**
   * Takes a mark off. False when it was not there, which is not an error: the
   * asset is unmarked either way.
   */
  async unmark(projectId: string, assetId: string, kind: AssetMarkKind): Promise<boolean> {
    return this.marks.remove(
      requireText('projectId', projectId, 200),
      requireText('assetId', assetId, 200),
      requireOneOf('kind', kind, ASSET_MARK_KINDS),
    );
  }

  /** The project's marks, so a grid can show its stars in one read. */
  async listMarks(projectId: string, kinds?: readonly AssetMarkKind[]): Promise<AssetMark[]> {
    return this.marks.listByProject(projectId, kinds);
  }

  /**
   * Approves an asset as (part of) the current selection for one context.
   *
   * `supersedes` is written as its own row per replaced asset, each naming this
   * approval, so "what replaced it?" is answerable from the superseded row
   * itself instead of being inferred from timestamps.
   */
  async approve(projectId: string, input: ApproveAssetInput): Promise<ApproveAssetResult> {
    const context = requireAssetSelectionContext('context', input.context);
    await this.requireContext(projectId, input.assetId, context);

    const replaced = await this.resolveSupersedes(projectId, input, context);

    const approval = createAssetSelection(
      {
        projectId,
        assetId: input.assetId,
        context,
        state: 'approved',
        actor: input.actor,
        note: input.note,
      },
      this.deps,
    );

    const supersessions = replaced.map((assetId) =>
      createAssetSelection(
        {
          projectId,
          assetId,
          context,
          state: 'superseded',
          actor: input.actor,
          note: input.note,
          supersededBySelectionId: approval.id,
        },
        this.deps,
      ),
    );

    const written = await this.selections.insertMany([approval, ...supersessions]);
    const [first, ...rest] = written;
    if (!first) throw new Error('Insert returned no asset selection rows');

    return { approval: first, superseded: rest };
  }

  /**
   * Records that an asset is not the choice for this context.
   *
   * The file, its `Generation` and its lineage are untouched — a rejected
   * concept stays in the library, keeps its provenance and can still be
   * approved for something else later.
   */
  async reject(projectId: string, input: RejectAssetInput): Promise<AssetSelection> {
    const context = requireAssetSelectionContext('context', input.context);
    await this.requireContext(projectId, input.assetId, context);

    const [rejection] = await this.selections.insertMany([
      createAssetSelection(
        {
          projectId,
          assetId: input.assetId,
          context,
          state: 'rejected',
          actor: input.actor,
          note: input.note,
        },
        this.deps,
      ),
    ]);

    if (!rejection) throw new Error('Insert returned no asset selection row');
    return rejection;
  }

  /** What is approved for one context now, and every decision that got it there. */
  async getSummary(
    projectId: string,
    context: AssetSelectionContext,
  ): Promise<AssetSelectionSummary> {
    const requested = requireAssetSelectionContext('context', context);
    const history = await this.selections.listByContext(projectId, requested);

    return { context: requested, current: currentAssetSelections(history), history };
  }

  /**
   * Every decision made for one entity, across all of its purposes.
   *
   * This is what lets a character or a location say which visuals it currently
   * stands behind — plural, and per purpose — from a single read.
   */
  async listForEntity(projectId: string, entityId: string): Promise<AssetSelection[]> {
    return this.selections.listByContextEntity(projectId, requireText('entityId', entityId, 200));
  }

  /** Every decision about one asset, so a rejected concept stays traceable. */
  async listForAsset(projectId: string, assetId: string): Promise<AssetSelection[]> {
    return this.selections.listByAsset(projectId, assetId);
  }

  /**
   * The assets `input` claims to replace, checked against what is actually
   * approved.
   *
   * Superseding something that was never the choice would write history that
   * did not happen, so it is a conflict rather than a silent no-op.
   */
  private async resolveSupersedes(
    projectId: string,
    input: ApproveAssetInput,
    context: AssetSelectionContext,
  ): Promise<string[]> {
    const requested = [...new Set(input.supersedes ?? [])];
    if (requested.length === 0) return [];

    if (requested.includes(input.assetId)) {
      throw new ValidationError('An asset cannot supersede itself', {
        assetId: input.assetId,
        purpose: context.purpose,
      });
    }

    const latest = latestSelectionByAsset(await this.selections.listByContext(projectId, context));

    for (const assetId of requested) {
      if (latest.get(assetId)?.state !== 'approved') {
        throw new ConflictError('Only an approved asset can be superseded', {
          assetId,
          entityId: context.entityId,
          purpose: context.purpose,
        });
      }
    }

    return requested;
  }

  /** 404s an asset that is not this project's, the same as a comment about one would. */
  private async requireAsset(projectId: string, assetId: string): Promise<void> {
    await this.targets.requireTarget(projectId, {
      type: 'asset',
      id: assetId,
      anchor: null,
      versionId: null,
    });
  }

  /** Both ends of a decision have to exist: the file chosen, and what it was chosen for. */
  private async requireContext(
    projectId: string,
    assetId: string,
    context: AssetSelectionContext,
  ): Promise<void> {
    await Promise.all([
      this.requireAsset(projectId, assetId),
      this.targets.requireTarget(projectId, {
        type: 'entity',
        id: context.entityId,
        anchor: null,
        versionId: null,
      }),
    ]);
  }
}
