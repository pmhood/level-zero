import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Markers that only appear in text somebody wrote *as* Markdown. A pasted
 * sentence, URL or code snippet hits none of them and takes the normal
 * plain-text path.
 */
const MARKDOWN_MARKERS = [
  /^ {0,3}#{1,6} \S/m, // heading
  /^ {0,3}[-*+] \S/m, // bullet list
  /^ {0,3}\d+\. \S/m, // ordered list
  /^ {0,3}> /m, // blockquote
  /^ {0,3}(?:```|~~~)/m, // fenced code
  /^ {0,3}\|.*\|[ \t]*$/m, // table row
  /^ {0,3}(?:[-*_][ \t]*){3,}$/m, // horizontal rule
  /!?\[[^\]\n]*\]\([^)\s]+\)/, // link or image
  /(\*\*|__)(?!\s)[^\n]+?\1/, // bold
];

/** Whether `text` carries enough Markdown syntax to be worth parsing as Markdown. */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_MARKERS.some((marker) => marker.test(text));
}

/**
 * Turns pasted Markdown into real nodes.
 *
 * Only plain-text pastes are considered: when the clipboard also carries HTML
 * (copying out of a browser or another editor) ProseMirror's own parser knows
 * more about the source than a Markdown reader would.
 */
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste: (_view, event) => {
            const clipboard = event.clipboardData;
            if (!clipboard || clipboard.types.includes('text/html')) return false;

            const text = clipboard.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) return false;

            return editor.commands.insertContent(text, { contentType: 'markdown' });
          },
        },
      }),
    ];
  },
});
