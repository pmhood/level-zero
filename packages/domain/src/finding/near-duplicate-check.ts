import { type Entity } from '../entity/entity';
import { type AiCheckContext, type AiConsistencyCheck } from './ai-consistency-check';
import { JUDGEMENT_FORMAT_INSTRUCTION, parseJudgedFindings } from './ai-judgement';
import { normalizedEntityName } from './duplicate-name-check';

/**
 * How many entities a scan searches *from*.
 *
 * Each probe is an embedding call and an index query, so this is what stops a
 * large project turning one scan into thousands of them. The most recently
 * touched entities are probed first: a duplicate is usually something just
 * written, not something settled months ago.
 */
const MAX_PROBES = 200;
/** Nearest neighbours considered per probe. Past a handful they are not near. */
const NEIGHBOURS_PER_PROBE = 3;
/** Pairs put to the model in one judgement, highest-scoring first. */
const MAX_PAIRS = 25;

/** A pair retrieval proposed, and the closest score that proposed it. */
interface CandidatePair {
  first: Entity;
  second: Entity;
  score: number;
}

/**
 * Two entities that read like the same concept written twice, where nothing
 * about them is literally equal.
 *
 * Retrieval proposes and the judgement decides (§7.6). A cosine score says
 * two rows sit near each other in one vector space, which is not a proof that
 * they are the same idea and must never be shown as one — so this check's
 * findings are `ai_assisted`, carry the `Generation` that decided them, and
 * say "reads as" rather than "is".
 *
 * Pairs the deterministic `duplicate-name` check already proves are left out:
 * the same two entities should not appear once proven and once interpreted.
 */
export const nearDuplicateCheck: AiConsistencyCheck = {
  id: 'near-duplicate',
  title: 'Near-duplicate concept',

  async run(facts, ai) {
    const pairs = await proposePairs(facts.entities, ai);
    if (pairs.length === 0) return null;

    const contextEntityIds = [...new Set(pairs.flatMap((pair) => [pair.first.id, pair.second.id]))];
    const judgement = await ai.judge({ prompt: buildPrompt(pairs), contextEntityIds });

    return {
      generationId: judgement.generationId,
      findings: parseJudgedFindings(
        nearDuplicateCheck.id,
        judgement.output,
        new Set(contextEntityIds),
      ),
    };
  },
};

/**
 * Asks the index which entities sit near each other, and keeps the closest
 * pairs worth judging.
 *
 * Pairs are keyed by their two ids so the same neighbours found from both
 * ends collapse into one, and the strongest score survives.
 */
async function proposePairs(
  entities: readonly Entity[],
  ai: AiCheckContext,
): Promise<CandidatePair[]> {
  const live = entities.filter((entity) => entity.status !== 'archived');
  const byId = new Map(live.map((entity) => [entity.id, entity]));

  const probes = [...live]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_PROBES);

  const pairs = new Map<string, CandidatePair>();

  for (const probe of probes) {
    const candidates = await ai.retrieve({
      text: probeText(probe),
      excludeEntityId: probe.id,
      limit: NEIGHBOURS_PER_PROBE,
    });

    for (const candidate of candidates) {
      const other = byId.get(candidate.entityId);
      if (!other || isProvenDuplicate(probe, other)) continue;

      const [first, second] = probe.id <= other.id ? [probe, other] : [other, probe];
      const key = `${first.id}::${second.id}`;
      const existing = pairs.get(key);
      if (existing && existing.score >= candidate.score) continue;

      pairs.set(key, { first, second, score: candidate.score });
    }
  }

  return [...pairs.values()]
    .sort((a, b) => b.score - a.score || a.first.id.localeCompare(b.first.id))
    .slice(0, MAX_PAIRS);
}

/** What `duplicate-name` already proves, so this check does not re-interpret it. */
function isProvenDuplicate(a: Entity, b: Entity): boolean {
  return a.type === b.type && normalizedEntityName(a.name) === normalizedEntityName(b.name);
}

function probeText(entity: Entity): string {
  return [entity.name, entity.description ?? '', entity.tags.join(' ')]
    .filter((part) => part.trim().length > 0)
    .join('\n');
}

/**
 * Names the pairs and their ids in the prompt itself.
 *
 * The assembled context describes each object, but the briefing it renders
 * lists objects by name — so the ids a judgement has to cite are stated here,
 * where the question is.
 */
function buildPrompt(pairs: readonly CandidatePair[]): string {
  const lines = pairs.map(
    (pair) =>
      `- ${describe(pair.first)} and ${describe(pair.second)}` +
      ` (retrieval similarity ${pair.score.toFixed(2)})`,
  );

  return [
    'A search of this project proposed the pairs below as possibly describing the same concept twice.',
    'Similarity is only a proposal; decide for each pair whether the two objects really are one concept',
    'written up twice, or two separate things that happen to be described in similar words.',
    '',
    ...lines,
    '',
    JUDGEMENT_FORMAT_INSTRUCTION,
  ].join('\n');
}

function describe(entity: Entity): string {
  return `"${entity.name}" [${entity.type}] (id: ${entity.id})`;
}
