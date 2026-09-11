import { fingerprint, type ConsistencyCheck } from './consistency-check';
import { type CheckFinding } from './finding';

/**
 * A prototype version pinned to an entity version that is no longer the
 * entity's current one.
 *
 * `PrototypeMember` stores `entityVersionId` precisely so a playable
 * experiment does not follow its entities as they change; this check is the
 * other half of that bargain — the pin is correct, and someone should know the
 * world moved on. Draft prototype versions are the ones worth flagging: an
 * archived or already-playable version is a record of what was built, and its
 * pins are meant to be old.
 *
 * Written against `docs/decisions/consistency-findings.md` §6.3. Note what it
 * does not say: `ENTITY_STATUSES` has no "approved" state, so this reports the
 * pin against the entity's *current* version rather than implying a judgement
 * the data cannot support.
 */
export const stalePrototypePinCheck: ConsistencyCheck = {
  id: 'stale-prototype-pin',
  title: 'Stale prototype pin',

  run({ entities, prototypeVersions }) {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const findings: CheckFinding[] = [];

    for (const version of prototypeVersions) {
      if (version.status !== 'draft') continue;

      for (const member of version.members) {
        const entity = byId.get(member.entityId);
        if (!entity?.currentVersionId) continue;
        if (entity.currentVersionId === member.entityVersionId) continue;

        findings.push({
          fingerprint: fingerprint('stale-prototype-pin', version.id, member.entityId),
          severity: 'warning',
          summary: `${entity.name} has changed since this prototype version pinned it.`,
          evidence: [
            {
              entityId: version.prototypeId,
              entityVersionId: member.entityVersionId,
              where: `Prototype version ${version.versionNumber}`,
              states: `pinned to an earlier ${entity.name}`,
            },
            {
              entityId: entity.id,
              entityVersionId: entity.currentVersionId,
              where: entity.name,
              states: 'has a newer current version',
            },
          ],
        });
      }
    }
    return findings;
  },
};
