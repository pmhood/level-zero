import { type PrototypeMemberChange, type PrototypeVersionComparison } from '../prototype/compare';
import { type EntityVersion } from '../version/entity-version';
import {
  compactDifferences,
  describeValue,
  difference,
  type Difference,
  type DifferenceGroup,
} from './difference';

export const PROTOTYPE_DETAILS_GROUP = 'Details';
export const CONTENTS_GROUP = 'What is in it';

/** Shown for a pinned version that was not handed over — archived, or out of scope. */
export const UNAVAILABLE = 'Not available';

/**
 * Two playable versions of the same prototype, side by side.
 *
 * The membership half is `comparePrototypeVersions`' own answer, named: this
 * only resolves the version ids it reports to the entity and the version
 * number a reader recognises. `pinned` is the entity versions either side
 * names — from each version's contents — and a version missing from it keeps
 * its row and says so, because a pin that no longer resolves is something to
 * look at rather than something to hide.
 */
export function prototypeVersionDifferences(
  comparison: PrototypeVersionComparison,
  pinned: readonly EntityVersion[],
): DifferenceGroup[] {
  const versions = new Map(pinned.map((version) => [version.id, version]));

  const details = compactDifferences([
    difference(
      'name',
      'Name',
      describeValue(comparison.from.name),
      describeValue(comparison.to.name),
    ),
    difference('status', 'Status', comparison.from.status, comparison.to.status),
    difference(
      'notes',
      'Notes',
      describeValue(comparison.from.notes),
      describeValue(comparison.to.notes),
    ),
    difference(
      'buildAssetId',
      'Playable build',
      comparison.from.buildAssetId ? 'Attached' : null,
      comparison.to.buildAssetId ? 'Attached' : null,
    ),
  ]);

  const contents: Difference[] = [
    ...comparison.added,
    ...comparison.changed,
    ...comparison.removed,
  ].map((member) => memberDifference(member, versions));

  return [
    ...(details.length > 0 ? [{ title: PROTOTYPE_DETAILS_GROUP, differences: details }] : []),
    ...(contents.length > 0 ? [{ title: CONTENTS_GROUP, differences: contents }] : []),
  ];
}

function memberDifference(
  member: PrototypeMemberChange,
  versions: ReadonlyMap<string, EntityVersion>,
): Difference {
  const named = (member.to ?? member.from) as string;

  return {
    key: member.entityId,
    label: versions.get(named)?.snapshot.name ?? member.entityId,
    change: member.from === null ? 'added' : member.to === null ? 'removed' : 'changed',
    from: versionLabel(member.from, versions),
    to: versionLabel(member.to, versions),
  };
}

function versionLabel(
  entityVersionId: string | null,
  versions: ReadonlyMap<string, EntityVersion>,
): string | null {
  if (entityVersionId === null) return null;
  const version = versions.get(entityVersionId);
  return version ? `v${version.versionNumber}` : UNAVAILABLE;
}
