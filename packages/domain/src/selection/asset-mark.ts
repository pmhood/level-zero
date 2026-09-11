import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { requireOneOf, requireText } from '../shared/validation';

/**
 * The fast ways to set an asset aside while triaging a wall of results.
 *
 * A mark is not a decision. Starring six of forty concepts and shortlisting two
 * of those six says "come back to these", which is why marks live here and not
 * in `AssetSelection`: they are a set that a click adds to and another click
 * takes away from, they carry no context, and nobody needs the history of an
 * unstarring. An approval is the opposite on all three counts.
 *
 * `favorite` and `shortlisted` are independent, not a ladder — an asset can be
 * either, both or neither — which is the other reason they are marks rather
 * than states in a newest-wins history.
 */
export const ASSET_MARK_KINDS = ['favorite', 'shortlisted'] as const;
export type AssetMarkKind = (typeof ASSET_MARK_KINDS)[number];

export const MAX_ASSET_MARK_ACTOR_LENGTH = 200;

/**
 * One mark on one asset.
 *
 * Project-scoped rather than per-person: there is no signed-in user yet, so
 * "the team shortlisted these six" is the only reading `actor` can honestly
 * support. `actor` records who put it there anyway, which is what a per-user
 * shortlist would need once authentication lands.
 */
export interface AssetMark {
  id: string;
  projectId: string;
  assetId: string;
  kind: AssetMarkKind;
  /** Free text until authentication lands; then a user id. */
  actor: string;
  markedAt: Date;
}

export interface CreateAssetMarkInput {
  projectId: string;
  assetId: string;
  kind: AssetMarkKind;
  actor: string;
}

export interface AssetMarkFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createAssetMark(
  input: CreateAssetMarkInput,
  deps: AssetMarkFactoryDeps,
): AssetMark {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    assetId: requireText('assetId', input.assetId, 200),
    kind: requireOneOf('kind', input.kind, ASSET_MARK_KINDS),
    actor: requireText('actor', input.actor, MAX_ASSET_MARK_ACTOR_LENGTH),
    markedAt: deps.clock.now(),
  };
}
