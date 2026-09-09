import { type PrototypeVersion } from './prototype-version';

/**
 * One entity's pin, as it differs between two prototype versions.
 *
 * `from` and `to` are `EntityVersion` ids: null on the side the entity was not
 * part of, which is what distinguishes an addition or a removal from a change.
 */
export interface PrototypeMemberChange {
  entityId: string;
  from: string | null;
  to: string | null;
}

export interface PrototypeVersionComparison {
  from: PrototypeVersion;
  to: PrototypeVersion;
  /** Entities included in `to` that `from` did not have. */
  added: PrototypeMemberChange[];
  /** Entities `from` included that `to` dropped. */
  removed: PrototypeMemberChange[];
  /** Entities in both, pinned to a different version. */
  changed: PrototypeMemberChange[];
}

/**
 * Which entity versions moved between two prototype versions.
 *
 * The unit of comparison is the entity, not the version row: "the diver is now
 * on version 4" is the answer a playtest report needs, and an entity that kept
 * the same pin is not a change at all.
 */
export function comparePrototypeVersions(
  from: PrototypeVersion,
  to: PrototypeVersion,
): PrototypeVersionComparison {
  const before = new Map(from.members.map((member) => [member.entityId, member.entityVersionId]));
  const after = new Map(to.members.map((member) => [member.entityId, member.entityVersionId]));

  const comparison: PrototypeVersionComparison = { from, to, added: [], removed: [], changed: [] };

  for (const [entityId, toVersionId] of after) {
    const fromVersionId = before.get(entityId);
    if (fromVersionId === undefined) {
      comparison.added.push({ entityId, from: null, to: toVersionId });
    } else if (fromVersionId !== toVersionId) {
      comparison.changed.push({ entityId, from: fromVersionId, to: toVersionId });
    }
  }

  for (const [entityId, fromVersionId] of before) {
    if (!after.has(entityId)) {
      comparison.removed.push({ entityId, from: fromVersionId, to: null });
    }
  }

  return comparison;
}
