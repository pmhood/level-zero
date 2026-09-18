import { type DocumentContent } from './document';

/**
 * The sections #167 names for a fresh design document, in the order a writer
 * reads them: the shape of the game before the loop, the loop, what drives
 * it, the world it runs in, and what came of trying it.
 *
 * Each section's prose is a placeholder a writer replaces, not an instruction
 * they work around — no "TODO", no brackets, no imperative voice. It never
 * references a project entity: a fresh project has nothing yet to reference,
 * and a template full of broken mentions is worse than plain text.
 */
const GDD_STARTING_SECTIONS: ReadonlyArray<{ heading: string; prose: string }> = [
  {
    heading: 'High Concept',
    prose:
      "The one or two sentences that tell someone who has never heard of this game what it is and why they'd want to play it.",
  },
  {
    heading: 'Design Pillars',
    prose:
      'The handful of principles that describe what this game is trying to be — the ones a design decision gets checked against when two good ideas conflict.',
  },
  {
    heading: 'Core Loop',
    prose: 'What a player actually does, moment to moment, and why they choose to do it again.',
  },
  {
    heading: 'Mechanics',
    prose:
      'The systems and rules that make the core loop work — what the player controls, what responds to it, and what it costs them.',
  },
  {
    heading: 'World',
    prose:
      'The setting, its history and its tone — the facts about this place that make everything else in the document believable.',
  },
  {
    heading: 'Characters',
    prose: 'Who the player plays as, who they meet, and what each one wants.',
  },
  {
    heading: 'Progression',
    prose:
      'How the game changes as a player spends more time with it — what they unlock, what gets harder, and what keeps it worth continuing.',
  },
  {
    heading: 'UI/UX',
    prose:
      'What the player sees and how they act on it — the screens, the controls, and the feedback that tells them what just happened.',
  },
  {
    heading: 'Audio/Visual Direction',
    prose:
      'The look and sound this game is aiming for, and the references that describe it faster than words can.',
  },
  {
    heading: 'Prototype / Playtest Notes',
    prose:
      'What has actually been built and tried so far, what playtesters said about it, and what changed in the design above because of it.',
  },
];

/**
 * A fresh design document's starting body: the sections above this comment,
 * a heading each, holding one line of prose about what belongs there.
 *
 * This is content, not schema (#189) — it produces plain `heading` and
 * `paragraph` nodes and stops existing. Nothing marks a section as "from the
 * template"; `DocumentService.create` and `applyStartingStructure` run the
 * result through `assignSectionIds` exactly as they would a hand-typed body,
 * so a seeded section is indistinguishable from one a writer typed, and
 * renaming, reordering, deleting or adding to it works exactly the same way.
 *
 * Deliberately not the Appendices group the mockup shows: #185 decided that
 * group is presentation, derived from a heading a writer types, and this
 * function does not prejudge whether a fresh document should have one.
 */
export function gddStartingStructureContent(): DocumentContent {
  return {
    type: 'doc',
    content: GDD_STARTING_SECTIONS.flatMap(({ heading, prose }) => [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: heading }] },
      { type: 'paragraph', content: [{ type: 'text', text: prose }] },
    ]),
  };
}
