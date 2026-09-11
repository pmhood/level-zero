import type { Route } from 'next';

/**
 * What a command does once chosen.
 *
 * Closed on purpose (issue #68): every command palette command today either
 * takes the user to a canonical destination, or switches the palette into
 * semantic search ("Ask Level Zero"). Adding a third real behavior later
 * means adding a third variant here, not widening this into a generic
 * `run: () => void` that could hide anything.
 */
export type PaletteCommandAction = { type: 'navigate'; href: Route } | { type: 'ask' };

export type PaletteCommandKind = 'action' | 'ai';

/**
 * One entry in the palette (spec section 28).
 *
 * `kind` is what keeps deterministic and AI actions visually distinct
 * (issue #68's requirement, and CLAUDE.md's Level Zero Blue / AI purple
 * split) — `'ai'` is reserved for commands that involve a generative or
 * semantic call, exactly as `--lz-ai` is reserved for AI/generative UI
 * elsewhere in the app.
 */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Group heading the command renders under. */
  group: string;
  kind: PaletteCommandKind;
  /** Extra words the fuzzy matcher should also match on, beyond the label. */
  keywords?: string[];
  action: PaletteCommandAction;
}

/**
 * Subsequence match: every character of `query` appears in `text`, in that
 * order, case-insensitively. This is the same lightweight fuzzy matching
 * most command palettes use — "crchr" matches "Create Character" — without
 * pulling in a scoring library for a list this small.
 */
export function fuzzyMatches(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = text.toLowerCase();
  let needleIndex = 0;
  for (const char of haystack) {
    if (char === needle[needleIndex]) needleIndex += 1;
    if (needleIndex === needle.length) return true;
  }
  return false;
}

/** A command matches if the query is a fuzzy subsequence of its label, group or any keyword. */
export function matchesCommand(command: PaletteCommand, query: string): boolean {
  if (!query.trim()) return true;
  return [command.label, command.group, ...(command.keywords ?? [])].some((field) =>
    fuzzyMatches(field, query),
  );
}

function navigate(href: string): PaletteCommandAction {
  return { type: 'navigate', href: href as Route };
}

/**
 * Every command the palette offers, scoped to one project.
 *
 * This is the palette's whole "registration model": a plain array built from
 * a `projectId`, the same shape `ProjectSidebar` already uses for its nav
 * items and `BASE_EDITOR_COMMANDS`/`EditorCommand` already uses for the rich
 * text editor's slash menu. No workspace imports another workspace, or the
 * palette, to appear here — this module is the only thing that imports
 * route shapes, the same one-directional dependency `ProjectSidebar` already
 * has. Extending it is appending one object literal; nothing needs a
 * registry, a side-effecting `registerCommand()` call at import time, or a
 * dynamic import to keep that true (see docs/decisions/canonical-entity-routes.md
 * §12 on why this is deliberately not shaped like `ENTITY_DETAIL_BODIES`).
 *
 * Workspace navigation and entity creation are collapsed onto the same
 * destination: every workspace already shows its creation form in the
 * inspector when nothing is selected (`IdeaComposer`, `CharacterComposer`,
 * `MechanicComposer`, `WorldComposer`), so "Create Character" and "Go to
 * Characters" are deliberately the same navigation — the palette never
 * renders its own copy of a creation form, which is what keeps a mutation
 * behind the exact validation and permissions its native workspace already
 * enforces (issue #68's constraint).
 */
export function buildProjectCommands(projectId: string): PaletteCommand[] {
  const base = `/projects/${projectId}`;

  return [
    // --- Navigate --------------------------------------------------------
    { id: 'go-overview', label: 'Go to Overview', group: 'Navigate', kind: 'action', action: navigate(base) },
    {
      id: 'go-idea-lab',
      label: 'Go to Idea Lab',
      group: 'Navigate',
      kind: 'action',
      keywords: ['ideas'],
      action: navigate(`${base}/idea-lab`),
    },
    {
      id: 'go-world',
      label: 'Go to World',
      group: 'Navigate',
      kind: 'action',
      keywords: ['locations', 'factions', 'regions', 'lore'],
      action: navigate(`${base}/world`),
    },
    {
      id: 'go-characters',
      label: 'Go to Characters',
      group: 'Navigate',
      kind: 'action',
      action: navigate(`${base}/characters`),
    },
    {
      id: 'go-mechanics',
      label: 'Go to Mechanics',
      group: 'Navigate',
      kind: 'action',
      action: navigate(`${base}/mechanics`),
    },
    {
      id: 'go-moodboards',
      label: 'Go to Moodboards',
      group: 'Navigate',
      kind: 'action',
      action: navigate(`${base}/moodboards`),
    },
    {
      id: 'go-gdd',
      label: 'Go to GDD',
      group: 'Navigate',
      kind: 'action',
      keywords: ['document', 'design doc'],
      action: navigate(`${base}/gdd`),
    },
    {
      id: 'go-search',
      label: 'Go to Search',
      group: 'Navigate',
      kind: 'action',
      action: navigate(`${base}/search`),
    },
    {
      id: 'go-consistency',
      label: 'Go to Consistency',
      group: 'Navigate',
      kind: 'action',
      keywords: ['findings'],
      action: navigate(`${base}/consistency`),
    },

    // --- Create ------------------------------------------------------------
    {
      id: 'create-idea',
      label: 'Create Idea',
      group: 'Create',
      kind: 'action',
      action: navigate(`${base}/idea-lab`),
    },
    {
      id: 'create-character',
      label: 'Create Character',
      group: 'Create',
      kind: 'action',
      action: navigate(`${base}/characters`),
    },
    {
      id: 'create-mechanic',
      label: 'Create Mechanic',
      group: 'Create',
      kind: 'action',
      action: navigate(`${base}/mechanics`),
    },
    {
      id: 'create-location',
      label: 'Create Location',
      group: 'Create',
      kind: 'action',
      keywords: ['world', 'place'],
      action: navigate(`${base}/world`),
    },
    {
      id: 'create-document',
      label: 'Create Document',
      group: 'Create',
      kind: 'action',
      keywords: ['gdd'],
      action: navigate(`${base}/gdd`),
    },

    // --- Ask Level Zero ------------------------------------------------------
    {
      id: 'ask-level-zero',
      label: 'Ask Level Zero…',
      group: 'Ask Level Zero',
      kind: 'ai',
      keywords: ['semantic', 'related', 'ai', 'search by meaning'],
      action: { type: 'ask' },
    },
  ];
}
