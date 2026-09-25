import { ASK_CAPABILITY, type AiInspectorAction } from './inspector-actions';

/**
 * The drafting panel's tabs (#260): framings of one request, never four
 * pipelines (#167). Chat is the plain ask; the other three tell the model
 * what shape to answer in before the freeform request is sent down the same
 * `useRunAiAction` path everything else uses.
 */
export const DRAFTING_TABS = [
  { value: 'chat', label: 'Chat', placeholder: 'Ask anything…' },
  { value: 'generate', label: 'Generate', placeholder: 'Describe what to write…' },
  { value: 'summarize', label: 'Summarize', placeholder: 'Describe what to summarize…' },
  { value: 'specs', label: 'Specs', placeholder: 'Describe what to turn into a spec…' },
] as const;

export type DraftingTab = (typeof DRAFTING_TABS)[number]['value'];

/** How the selected tab reframes a freeform request before it is sent. */
export function frameDraftingRequest(tab: DraftingTab, request: string): string {
  switch (tab) {
    case 'chat':
      return request;
    case 'generate':
      return `Write finished, polished game design document prose for this: ${request}`;
    case 'summarize':
      return `Summarize this concisely, keeping only the design decisions that matter: ${request}`;
    case 'specs':
      return `Turn this into a structured technical specification, with headings and concrete, checkable requirements: ${request}`;
  }
}

/**
 * The mockup's four standing suggestions: one-click, already-framed requests
 * rather than prefilled text the user still has to submit themselves.
 */
export const DRAFTING_SUGGESTIONS: readonly AiInspectorAction[] = [
  {
    id: 'draft-core-loop-spec',
    label: 'Turn the core loop into a detailed spec',
    hint: 'A structured spec for the core loop',
    capability: ASK_CAPABILITY,
    instruction: frameDraftingRequest('specs', 'the core loop'),
  },
  {
    id: 'draft-progression-detail',
    label: 'Write progression systems in more detail',
    hint: 'Expanded progression-systems prose',
    capability: ASK_CAPABILITY,
    instruction: frameDraftingRequest('generate', 'the progression systems section'),
  },
  {
    id: 'draft-summarize-decisions',
    label: 'Summarize all design decisions',
    hint: 'A condensed summary of the whole document',
    capability: ASK_CAPABILITY,
    instruction: frameDraftingRequest('summarize', 'every design decision this document makes'),
  },
  {
    id: 'draft-tech-checklist',
    label: 'Create a technical requirements checklist',
    hint: 'A checklist engineering could build from',
    capability: ASK_CAPABILITY,
    instruction: frameDraftingRequest('specs', 'a technical requirements checklist for this game'),
  },
];
