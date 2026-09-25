import { describe, expect, it } from 'vitest';

import { DRAFTING_SUGGESTIONS, DRAFTING_TABS, frameDraftingRequest } from './drafting-requests';

describe('frameDraftingRequest', () => {
  it('sends Chat requests verbatim', () => {
    expect(frameDraftingRequest('chat', 'What is the core loop about?')).toBe(
      'What is the core loop about?',
    );
  });

  it('frames Generate, Summarize and Specs differently from each other and from Chat', () => {
    const request = 'the progression systems section';
    const framings = DRAFTING_TABS.map((tab) => frameDraftingRequest(tab.value, request));

    // Every framing still carries the request itself...
    for (const framed of framings) {
      expect(framed).toContain(request);
    }
    // ...but no two tabs frame it the same way.
    expect(new Set(framings).size).toBe(DRAFTING_TABS.length);
  });

  it('asks Generate for prose, Summarize for a condensed answer, and Specs for structure', () => {
    const request = 'the Vision section';
    expect(frameDraftingRequest('generate', request)).toMatch(/write/i);
    expect(frameDraftingRequest('summarize', request)).toMatch(/summari/i);
    expect(frameDraftingRequest('specs', request)).toMatch(/structured technical spec/i);
  });
});

describe('DRAFTING_SUGGESTIONS', () => {
  it('offers exactly the mockup’s four standing suggestions', () => {
    expect(DRAFTING_SUGGESTIONS.map((suggestion) => suggestion.label)).toEqual([
      'Turn the core loop into a detailed spec',
      'Write progression systems in more detail',
      'Summarize all design decisions',
      'Create a technical requirements checklist',
    ]);
  });

  it('is a one-click, already-framed request rather than an empty prefill', () => {
    for (const suggestion of DRAFTING_SUGGESTIONS) {
      expect(suggestion.capability).toBe('text.generate');
      expect(suggestion.instruction.length).toBeGreaterThan(0);
    }
  });
});
