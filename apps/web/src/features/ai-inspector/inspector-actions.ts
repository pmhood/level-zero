import type { AiCapability } from '@level-zero/ai';
import type { EntityType } from '@level-zero/domain';

import type { RunAiActionInput } from '@/lib/api';

import { subjectContext, type AiSubject } from './ai-subject';

/**
 * One contextual AI action the inspector can run on what is selected.
 *
 * The same shape as the editor's `AiEditAction`, plus the capability it asks
 * for: the API resolves that to a provider, so an action nothing can serve is
 * offered as unavailable rather than as a button that always fails. The
 * instruction is sent verbatim — the API keeps no second copy of what
 * "Critique the rules" means.
 *
 * Labels follow the style guide's AI language: contextual, plain, no
 * enthusiastic assistant copy.
 */
export interface AiInspectorAction {
  id: string;
  label: string;
  /** One short line saying what the user gets back. */
  hint: string;
  capability: AiCapability;
  /** What the model is told to do, sent verbatim as the instruction. */
  instruction: string;
}

/** The action id a freeform ask from the composer is recorded under. */
export const ASK_ACTION_ID = 'ask';
export const ASK_CAPABILITY: AiCapability = 'text.generate';

const CHARACTER_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'brainstorm-variants',
    label: 'Brainstorm variants',
    hint: 'Other versions of this character',
    capability: 'text.generate',
    instruction:
      'Offer three distinct variants of this character: each one a different answer to the same role in the game, not a restyling of the same person. Say in one line what each variant changes about the story or the play.',
  },
  {
    id: 'critique-consistency',
    label: 'Critique consistency',
    hint: 'Where they fight the rest of the project',
    capability: 'text.generate',
    instruction:
      'Check this character against the rest of the project material for inconsistencies: claims that contradict a faction, a location, a mechanic or another character. List what conflicts and with what. If nothing conflicts, say so.',
  },
  {
    id: 'visual-directions',
    label: 'Suggest visual directions',
    hint: 'Directions to take into a moodboard',
    capability: 'text.generate',
    instruction:
      'Describe three visual directions for this character — silhouette, palette, materials, wear — that follow from the world as the project material describes it. Write each as a brief a concept artist could work from.',
  },
  {
    id: 'expand-backstory',
    label: 'Expand backstory',
    hint: 'More of who they were',
    capability: 'text.generate',
    instruction:
      'Expand this character’s backstory with specifics that follow from the project material: who they owe, what they lost, where they have been. Do not invent anything that contradicts what the project already establishes.',
  },
];

const MECHANIC_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'critique-rules',
    label: 'Critique the rules',
    hint: 'Where this breaks down in play',
    capability: 'text.generate',
    instruction:
      'Critique this mechanic as a set of rules: where it is ambiguous, where it is dominated by one strategy, and where it stops being interesting. Be concrete about the situation in which each problem shows up.',
  },
  {
    id: 'suggest-tuning',
    label: 'Suggest tuning changes',
    hint: 'Which numbers to move, and why',
    capability: 'text.generate',
    instruction:
      'Suggest tuning changes to this mechanic. For each one name the parameter, the direction to move it, and the play experience the change is meant to produce. Do not invent parameters the project material does not already have.',
  },
  {
    id: 'identify-dependencies',
    label: 'Identify dependencies',
    hint: 'What else this touches',
    capability: 'text.generate',
    instruction:
      'Identify what this mechanic depends on and what depends on it, from the project material: other mechanics, systems, characters, locations. Flag any dependency that looks implied but is not recorded as a relationship.',
  },
  {
    id: 'generate-alternatives',
    label: 'Generate alternatives',
    hint: 'Other ways to get the same feeling',
    capability: 'text.generate',
    instruction:
      'Offer three alternative mechanics that produce the same player feeling as this one by different means. Say what each alternative gains and what it gives up.',
  },
];

const DOCUMENT_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'analyse-document',
    label: 'Analyse the document',
    hint: 'What it commits to, and what it leaves open',
    capability: 'text.generate',
    instruction:
      'Analyse this document: what design decisions it actually commits to, what it leaves unresolved, and which sections are thin relative to their importance.',
  },
  {
    id: 'find-contradictions',
    label: 'Find contradictions',
    hint: 'Where it argues with itself or the project',
    capability: 'text.generate',
    instruction:
      'Find contradictions in this document, and between it and the rest of the project material. Quote the two statements that conflict for each one. If nothing contradicts, say so.',
  },
  {
    id: 'expand-document',
    label: 'Suggest what is missing',
    hint: 'The sections that should exist',
    capability: 'text.generate',
    instruction:
      'Say what a reader of this document still could not build, and name the sections that should exist to close those gaps. Use what the project material already establishes rather than inventing design.',
  },
  {
    id: 'rewrite-summary',
    label: 'Rewrite as a summary',
    hint: 'The whole thing in a few lines',
    capability: 'text.rewrite',
    instruction:
      'Rewrite this document as a short summary that keeps every design decision it states and cuts everything else.',
  },
];

const PROTOTYPE_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'summarise-results',
    label: 'Summarise results',
    hint: 'What the versions and playtests say so far',
    capability: 'text.generate',
    instruction:
      'Summarise where this prototype has got to, from its version history, the notes on those versions and the playtests recorded against them. Say what is settled and what is still unknown.',
  },
  {
    id: 'explain-changes',
    label: 'Explain the changes',
    hint: 'What moved between versions',
    capability: 'text.generate',
    instruction:
      'Explain what changed across this prototype’s versions and what each change was evidently trying to fix. Work only from the version history and notes; say plainly where they do not explain a change.',
  },
  {
    id: 'next-experiment',
    label: 'Suggest the next experiment',
    hint: 'The next thing worth testing',
    capability: 'text.generate',
    instruction:
      'Suggest the next experiment for this prototype: the question to answer, the change to make, and what would count as an answer either way. One experiment, not a plan.',
  },
];

const ASSET_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'suggest-uses',
    label: 'Suggest uses',
    hint: 'Where this file earns its place',
    capability: 'text.generate',
    instruction:
      'Given this reference file and the project material, suggest where it could be used: which characters, locations, mechanics or documents it would serve, and what it establishes about them.',
  },
  {
    id: 'variation-directions',
    label: 'Describe variation directions',
    hint: 'Briefs to take into the generator',
    capability: 'text.generate',
    instruction:
      'Describe three variation directions for this reference, each as a brief an image generator could work from. Keep every direction consistent with the world the project material describes.',
  },
];

/** For every other canonical type: the questions worth asking about anything. */
const ENTITY_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'brainstorm',
    label: 'Brainstorm from this',
    hint: 'Where this could go next',
    capability: 'text.generate',
    instruction:
      'Offer three directions this could develop in, each following from the project material and each saying what it would change about the game.',
  },
  {
    id: 'critique',
    label: 'Critique this',
    hint: 'What is weak or unclear',
    capability: 'text.generate',
    instruction:
      'Critique this against the rest of the project material: what is vague, what is unmotivated, and what contradicts something already established.',
  },
  {
    id: 'expand',
    label: 'Expand this',
    hint: 'Say more, specifically',
    capability: 'text.generate',
    instruction:
      'Expand this with specifics that follow from the project material, without inventing anything that contradicts it.',
  },
];

const PROJECT_ACTIONS: readonly AiInspectorAction[] = [
  {
    id: 'whats-missing',
    label: 'What is this game missing?',
    hint: 'The gaps across the whole project',
    capability: 'text.generate',
    instruction:
      'From the project material, say what this game is still missing: the parts a player would notice the absence of, and the design questions nothing has answered yet.',
  },
  {
    id: 'pitch',
    label: 'Pitch it back to me',
    hint: 'The game as it currently reads',
    capability: 'text.generate',
    instruction:
      'Pitch this game back in a short paragraph, using only what the project material establishes. Then name the one claim in the pitch the project supports least.',
  },
  {
    id: 'project-ideation',
    label: 'Suggest what to explore',
    hint: 'Three things worth trying',
    capability: 'text.generate',
    instruction:
      'Suggest three things worth exploring next in this project, each one a concrete piece of work rather than a theme, and each following from what the project material already contains.',
  },
];

/**
 * One line per entity type whose selection deserves its own questions.
 *
 * Deliberately a plain object literal — no registration step, no strategy
 * objects — so the full set of type-specific catalogues is readable in one
 * place, the same way `ENTITY_DETAIL_BODIES` is. Every other type gets
 * `ENTITY_ACTIONS`.
 */
const ENTITY_TYPE_ACTIONS: Partial<Record<EntityType, readonly AiInspectorAction[]>> = {
  character: CHARACTER_ACTIONS,
  mechanic: MECHANIC_ACTIONS,
  system: MECHANIC_ACTIONS,
  document: DOCUMENT_ACTIONS,
  prototype: PROTOTYPE_ACTIONS,
};

/** What can be asked about the current selection. */
export function actionsFor(subject: AiSubject): readonly AiInspectorAction[] {
  switch (subject.kind) {
    case 'project':
      return PROJECT_ACTIONS;
    case 'asset':
      return ASSET_ACTIONS;
    case 'entity':
      return ENTITY_TYPE_ACTIONS[subject.entity.type] ?? ENTITY_ACTIONS;
  }
}

/**
 * The one shape every `useRunAiAction` mutation sends, whichever panel built
 * the action — the generic Ask AI form and the drafting panel's tabs and
 * standing suggestions alike (#167: one request path, not four pipelines).
 */
export function runAiActionInput(
  action: AiInspectorAction,
  subject: AiSubject,
  relatedDepth: number,
): RunAiActionInput {
  return {
    action: action.id,
    capability: action.capability,
    instruction: action.instruction,
    ...subjectContext(subject),
    relatedDepth,
  };
}

/**
 * Whether the deployment can actually run an action asking for this capability.
 *
 * `undefined` while the capability list is still loading: the panel shows the
 * actions as it will offer them rather than flickering through a disabled
 * state.
 */
export function capabilityAvailable(
  capability: AiCapability,
  capabilities: readonly AiCapability[] | undefined,
): boolean {
  return capabilities === undefined || capabilities.includes(capability);
}
