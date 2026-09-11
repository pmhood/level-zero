import { type Entity } from '../entity/entity';
import { fingerprint, type ConsistencyCheck } from './consistency-check';
import { type CheckFinding } from './finding';

/**
 * Two non-archived entities of the same type whose names are identical once
 * case-folded and stripped of punctuation — provably the same concept under
 * two names.
 *
 * "Provable" is deliberately narrow (§7.6): exact match after normalisation
 * only. `SearchDocumentRepository.searchSimilar` is the right way to find
 * candidate *near*-duplicates, but a cosine score is not a proof — that
 * belongs to a separate AI-assisted finding, where retrieval proposes the
 * pair and a `text.generate` judgement decides. Putting a similarity
 * threshold here would be exactly the "AI finding presented as proven" #72's
 * constraints forbid.
 */
export const duplicateNameCheck: ConsistencyCheck = {
  id: 'duplicate-name',
  title: 'Duplicate name',

  run({ entities }) {
    const groups = new Map<string, Entity[]>();

    for (const entity of entities) {
      if (entity.status === 'archived') continue;

      const key = `${entity.type}::${normalizedEntityName(entity.name)}`;
      const group = groups.get(key);
      if (group) {
        group.push(entity);
      } else {
        groups.set(key, [entity]);
      }
    }

    const findings: CheckFinding[] = [];

    for (const group of groups.values()) {
      const seen: Entity[] = [];
      for (const entity of group) {
        for (const earlier of seen) {
          findings.push(buildFinding(earlier, entity));
        }
        seen.push(entity);
      }
    }

    return findings;
  },
};

/**
 * Sorts the pair by id so the fingerprint (§4.3) is stable regardless of
 * which of the two entities the scan reaches first.
 */
function buildFinding(a: Entity, b: Entity): CheckFinding {
  const [first, second] = a.id <= b.id ? [a, b] : [b, a];

  return {
    fingerprint: fingerprint('duplicate-name', first.type, first.id, second.id),
    severity: 'conflict',
    summary: `${first.name} and ${second.name} look like the same ${first.type}.`,
    evidence: [
      { entityId: first.id, where: first.name, states: `also named ${second.name}` },
      { entityId: second.id, where: second.name, states: `also named ${first.name}` },
    ],
  };
}

/**
 * Case-folds and strips punctuation so "The Diver", "the diver!" and
 * "THE-DIVER" all match.
 *
 * Exported because the AI-assisted `near-duplicate` check uses it to leave
 * out the pairs this check already proves: one rule for what counts as the
 * same name, in the check that owns it.
 */
export function normalizedEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
