import { documentContent, documentPlainText } from '../document/document';
import { type Entity } from '../entity/entity';
import { type EntityType } from '../entity/entity-type';
import { type AiConsistencyCheck } from './ai-consistency-check';
import { JUDGEMENT_FORMAT_INSTRUCTION, parseJudgedFindings } from './ai-judgement';

/**
 * The entity types that carry narrative: what the world is, who is in it and
 * what happened there.
 *
 * Mechanics, systems and build artefacts are left out deliberately — a
 * contradiction between two numbers is either provable or it is a job for a
 * check that can read the numbers, not for a reader of prose.
 */
const NARRATIVE_ENTITY_TYPES: readonly EntityType[] = [
  'lore',
  'character',
  'location',
  'faction',
  'region',
  'event',
  'culture',
  'technology',
  'hazard',
  'scene',
  'document',
];

/**
 * How many narrative objects one judgement reads.
 *
 * Matches `DEFAULT_MAX_CONTEXT_ENTITIES` in the AI package: past that the
 * briefing is a sample either way, and a sample chosen here — most recently
 * written first — is a better one than a sample chosen by a truncated walk.
 */
const MAX_CONTEXT_ENTITIES = 40;

/**
 * Statements about the world that do not sit together: a character who died
 * in one place and speaks in another, a faction described as two different
 * things, a location whose history is told twice.
 *
 * This is the kind of finding §6.4 exists for. Nothing about it is provable —
 * prose contradicts prose only under a reading — so it is a judgement with a
 * `Generation` behind it, presented as an interpretation and never as a fact.
 * The material it reads is one project's, because `ProjectFacts` is one
 * project's.
 */
export const loreContradictionCheck: AiConsistencyCheck = {
  id: 'lore-contradiction',
  title: 'Lore contradiction',

  async run(facts, ai) {
    const narrative = selectNarrative(facts.entities);
    // One statement cannot contradict itself, and a finding needs two sides.
    if (narrative.length < 2) return null;

    const contextEntityIds = narrative.map((entity) => entity.id);
    const judgement = await ai.judge({ prompt: buildPrompt(narrative), contextEntityIds });

    return {
      generationId: judgement.generationId,
      findings: parseJudgedFindings(
        loreContradictionCheck.id,
        judgement.output,
        new Set(contextEntityIds),
      ),
    };
  },
};

/** Live narrative entities that actually say something, most recent first. */
function selectNarrative(entities: readonly Entity[]): Entity[] {
  return entities
    .filter(
      (entity) =>
        entity.status !== 'archived' &&
        NARRATIVE_ENTITY_TYPES.includes(entity.type) &&
        hasNarrativeText(entity),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_CONTEXT_ENTITIES);
}

function hasNarrativeText(entity: Entity): boolean {
  if ((entity.description ?? '').trim().length > 0) return true;
  return documentPlainText(documentContent(entity)).trim().length > 0;
}

/**
 * Names the objects and their ids in the prompt itself: the assembled context
 * carries the writing, but the briefing it renders lists objects by name, and
 * a judgement has to cite ids.
 */
function buildPrompt(entities: readonly Entity[]): string {
  return [
    'Read the project material above as one world and look for statements about it that do not sit together:',
    'two accounts of the same event, a character described one way and used another, a place whose history is told twice.',
    'Differences of emphasis, unfinished drafts and things simply not yet written are not contradictions.',
    '',
    'The objects in scope:',
    ...entities.map((entity) => `- "${entity.name}" [${entity.type}] (id: ${entity.id})`),
    '',
    JUDGEMENT_FORMAT_INSTRUCTION,
  ].join('\n');
}
