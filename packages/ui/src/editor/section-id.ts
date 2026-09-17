import { DOCUMENT_SECTION_ID_ATTR } from '@level-zero/domain';
import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';

/**
 * A section id. Opaque by design: never parsed, never displayed, and safe to
 * lose — a heading whose id an AI edit dropped is re-minted on the next pass
 * and reads as a new section.
 */
function mintSectionId(): string {
  return crypto.randomUUID();
}

/** Where a top-level heading with a missing or duplicated id sits, and its new id. */
function mintedSectionIds(doc: ProseMirrorNode): { pos: number; id: string }[] {
  const minted: { pos: number; id: string }[] = [];
  const seen = new Set<string>();

  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return;

    const current: unknown = node.attrs[DOCUMENT_SECTION_ID_ATTR];
    if (typeof current === 'string' && current.length > 0 && !seen.has(current)) {
      seen.add(current);
      return;
    }

    // Walking in reading order, the first heading to use an id keeps it — it is
    // the one existing anchors were written against — and any later heading
    // using the same id is re-minted.
    const id = mintSectionId();
    seen.add(id);
    minted.push({ pos: offset, id });
  });

  return minted;
}

/** Applies a mint pass to a transaction, outside the undo history. */
function applyMinting(
  transaction: Transaction,
  minted: readonly { pos: number; id: string }[],
): Transaction {
  // Only attributes change, so no position moves and no earlier entry needs
  // mapping. Minting is not an edit the writer made, so Ctrl+Z must not undo
  // it and strand the anchors written in between.
  transaction.setMeta('addToHistory', false);
  for (const { pos, id } of minted) {
    transaction.setNodeAttribute(pos, DOCUMENT_SECTION_ID_ATTR, id);
  }
  return transaction;
}

/**
 * Gives every top-level heading the id its section is addressed by.
 *
 * A GDD section's comments and review decisions are anchored to this id
 * (docs/decisions/gdd-section-identity.md), so it has to exist before anybody
 * can point at a section — which is why the editor mints as the writer types
 * rather than leaving it to the server: autosave posts the whole body, and a
 * server that minted afresh on every save would strand every anchor written
 * since the last one.
 *
 * It renders as `data-section-id`, which survives a copy and paste inside the
 * editor and is dropped by Markdown export, which has nowhere to put it.
 */
export const SectionId = Extension.create({
  name: 'sectionId',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          [DOCUMENT_SECTION_ID_ATTR]: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-section-id'),
            renderHTML: (attributes: Record<string, unknown>) => {
              const id = attributes[DOCUMENT_SECTION_ID_ATTR];
              return typeof id === 'string' && id.length > 0 ? { 'data-section-id': id } : {};
            },
          },
        },
      },
    ];
  },

  /**
   * ProseMirror runs `appendTransaction` for transactions, and loading a
   * document is not one — so a body written before section ids existed would
   * open with nothing in it addressable. This is the pass that fixes that, and
   * it costs a legacy document one extra autosave the first time it is opened.
   *
   * A read-only surface is skipped: there would be nowhere to save the result,
   * and an archived document rejects the write.
   */
  onCreate() {
    if (!this.editor.isEditable) return;

    const minted = mintedSectionIds(this.editor.state.doc);
    if (minted.length === 0) return;

    this.editor.view.dispatch(applyMinting(this.editor.state.tr, minted));
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sectionId'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const minted = mintedSectionIds(newState.doc);
          return minted.length === 0 ? null : applyMinting(newState.tr, minted);
        },
      }),
    ];
  },
});

/**
 * The section the selection sits in: the nearest top-level heading at or before
 * it. Null before the document's first heading, and for a heading the mint pass
 * has not reached yet.
 */
export function activeSectionId(editor: Editor): string | null {
  const { doc, selection } = editor.state;
  let active: string | null = null;
  let offset = 0;

  for (let index = 0; index < doc.childCount; index += 1) {
    if (offset > selection.from) break;

    const node = doc.child(index);
    if (node.type.name === 'heading') {
      const id: unknown = node.attrs[DOCUMENT_SECTION_ID_ATTR];
      active = typeof id === 'string' && id.length > 0 ? id : null;
    }
    offset += node.nodeSize;
  }

  return active;
}
