import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** One occurrence of a find query, as a position range in the document. */
export interface FindMatch {
  from: number;
  to: number;
}

/** The live find-in-document state: the query, where it matched, and which match is current. */
export interface FindInDocumentState {
  query: string;
  matches: FindMatch[];
  /** -1 when there is no current match — an empty query, or none found. */
  activeIndex: number;
}

const EMPTY_STATE: FindInDocumentState = { query: '', matches: [], activeIndex: -1 };

const findInDocumentKey = new PluginKey<FindInDocumentState>('findInDocument');

type FindMeta = { type: 'query'; query: string } | { type: 'step'; direction: 1 | -1 };

/** Wraps an index into `[0, length)`, or -1 for an empty range. */
function wrapIndex(index: number, length: number): number {
  if (length === 0) return -1;
  return ((index % length) + length) % length;
}

/**
 * Every case-insensitive, non-overlapping occurrence of `query` in the
 * document's text — headings, paragraphs, list items, table cells, callouts,
 * pull-quotes, all of it, because this walks the model (`doc.descendants`)
 * rather than the rendered DOM. A passage the writer has scrolled past, or
 * that sits off in a table cell, is found exactly the same way as one on
 * screen — there is no separate "visible text" this has to fall back to.
 */
function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let index = text.indexOf(needle);
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length });
      index = text.indexOf(needle, index + needle.length);
    }
  });
  return matches;
}

function decorationsFor(found: FindInDocumentState, doc: ProseMirrorNode): DecorationSet {
  if (found.matches.length === 0) return DecorationSet.empty;

  return DecorationSet.create(
    doc,
    found.matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === found.activeIndex ? 'lz-find-match lz-find-match-active' : 'lz-find-match',
      }),
    ),
  );
}

/**
 * Find-in-document (#191): a decoration pass over the loaded document, not a
 * DOM query against rendered text (the browser's own Ctrl+F, which the issue
 * exists because of, finds nothing scrolled out of the editor).
 *
 * Matches are never marks. Nothing this extension stores reaches
 * `editor.getJSON()` — the query, the matches and the active index are
 * plugin state, drawn with view decorations, the same reasoning
 * `ai-suggestion.ts`'s target range is — so a search can never end up in the
 * stored content, an export, an autosave or a version. `setFindQuery` and
 * `stepFindMatch` dispatch transactions that carry no document steps, so
 * ProseMirror's history plugin has nothing to record either: searching does
 * not add to, or consume, the writer's undo stack.
 */
export const FindInDocument = Extension.create({
  name: 'findInDocument',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindInDocumentState>({
        key: findInDocumentKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, value, _oldState, newState): FindInDocumentState {
            const meta = tr.getMeta(findInDocumentKey) as FindMeta | undefined;

            if (meta?.type === 'query') {
              const matches = findMatches(newState.doc, meta.query);
              return { query: meta.query, matches, activeIndex: matches.length ? 0 : -1 };
            }

            if (meta?.type === 'step') {
              if (value.matches.length === 0) return value;
              const activeIndex = wrapIndex(
                (value.activeIndex < 0 ? 0 : value.activeIndex) + meta.direction,
                value.matches.length,
              );
              return { ...value, activeIndex };
            }

            // Typing while the field is open moves the matches under it, so
            // they are re-found against the new text rather than left
            // pointing at stale positions.
            if (tr.docChanged && value.query) {
              const matches = findMatches(newState.doc, value.query);
              return {
                query: value.query,
                matches,
                activeIndex: wrapIndex(value.activeIndex, matches.length),
              };
            }

            return value;
          },
        },
        props: {
          decorations(state) {
            return decorationsFor(findInDocumentKey.getState(state) ?? EMPTY_STATE, state.doc);
          },
        },
      }),
    ];
  },
});

/** The live find state — query, matches and which one is current. */
export function findInDocumentState(state: EditorState): FindInDocumentState {
  return findInDocumentKey.getState(state) ?? EMPTY_STATE;
}

/** Runs a new search over the loaded document; the first match becomes current. */
export function setFindQuery(editor: Editor, query: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(findInDocumentKey, { type: 'query', query }));
}

/** Moves the current match forward (1) or back (-1), wrapping around. */
export function stepFindMatch(editor: Editor, direction: 1 | -1): void {
  editor.view.dispatch(editor.state.tr.setMeta(findInDocumentKey, { type: 'step', direction }));
}
