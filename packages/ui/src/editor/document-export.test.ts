import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import {
  renderDocumentMarkdown,
  renderStandaloneHtmlDocument,
  sanitizeDocumentForExport,
} from './document-export';

const EXTENSIONS = createEditorExtensions({ placeholder: 'Write…', slashMenu: false });

/** One document exercising every node the base extension set supports. */
const MARKDOWN = `# Design pillars

A **bold** claim with *emphasis* and a [link](https://example.com).

## Core loop

- Explore
- Scavenge

1. First
2. Second

- [ ] Write the loop
- [x] Name the game

> Tension comes from oxygen.

| Stat | Value |
| --- | --- |
| Oxygen | 120s |

\`\`\`ts
const depth = 1;
\`\`\`

![Concept](https://example.com/concept.png)
`;

function parse(markdown: string): JSONContent {
  const editor = new Editor({ extensions: EXTENSIONS, content: markdown, contentType: 'markdown' });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

describe('renderDocumentMarkdown', () => {
  const markdown = renderDocumentMarkdown(parse(MARKDOWN), EXTENSIONS);

  it('keeps headings', () => {
    expect(markdown).toContain('# Design pillars');
    expect(markdown).toContain('## Core loop');
  });

  it('keeps marks', () => {
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*emphasis*');
    expect(markdown).toContain('[link](https://example.com)');
  });

  it('keeps bullet and ordered lists', () => {
    expect(markdown).toContain('- Explore');
    expect(markdown).toContain('1. First');
  });

  it('keeps task lists, checked state included', () => {
    expect(markdown).toContain('- [ ] Write the loop');
    expect(markdown).toContain('- [x] Name the game');
  });

  it('keeps blockquotes', () => {
    expect(markdown).toContain('> Tension comes from oxygen.');
  });

  it('keeps tables', () => {
    expect(markdown).toContain('Stat');
    expect(markdown).toContain('Oxygen');
    expect(markdown).toContain('120s');
  });

  it('keeps code blocks', () => {
    expect(markdown).toContain('```ts');
    expect(markdown).toContain('const depth = 1;');
  });

  it('keeps images', () => {
    expect(markdown).toContain('![Concept](https://example.com/concept.png)');
  });
});

describe('renderStandaloneHtmlDocument', () => {
  const html = renderStandaloneHtmlDocument(parse(MARKDOWN), EXTENSIONS, { title: 'Driftwake' });

  it('is a standalone page, not a fragment', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Driftwake</title>');
  });

  it('keeps headings', () => {
    expect(html).toContain('<h1');
    expect(html).toContain('Design pillars');
    expect(html).toContain('<h2');
  });

  it('keeps marks', () => {
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>emphasis</em>');
    expect(html).toMatch(/<a[^>]*href="https:\/\/example\.com"/);
  });

  it('keeps lists', () => {
    expect(html).toContain('<ul');
    expect(html).toContain('<ol');
    expect(html).toContain('Explore');
  });

  it('keeps task lists', () => {
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('Write the loop');
  });

  it('keeps blockquotes', () => {
    expect(html).toContain('<blockquote');
    expect(html).toContain('Tension comes from oxygen.');
  });

  it('keeps tables', () => {
    expect(html).toContain('<table');
    expect(html).toContain('Oxygen');
  });

  it('keeps code blocks', () => {
    expect(html).toContain('<pre');
    expect(html).toContain('const depth = 1;');
  });

  it('keeps images', () => {
    expect(html).toMatch(/<img[^>]*src="https:\/\/example\.com\/concept\.png"/);
  });
});

/**
 * The fixtures below stand in for a node type this file's schema does not
 * define — a node some future branch adds before the export path imports it.
 * They must therefore name types nothing will ever register: naming a real
 * node (`callout`, say) makes the test pass only until that node lands, and
 * then fails as a schema change rather than as an export bug.
 */
describe('sanitizeDocumentForExport', () => {
  it('leaves a document made only of known node types untouched', () => {
    const doc = parse('# Title\n\nSome text.');
    expect(sanitizeDocumentForExport(doc, EXTENSIONS)).toEqual(doc);
  });

  it('replaces a node type the schema does not define with its flattened text, rather than dropping it', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before.' }] },
        {
          type: 'sillyFutureAdmonition',
          attrs: { tone: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Watch the oxygen.' }] }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] },
      ],
    };

    const sanitized = sanitizeDocumentForExport(doc, EXTENSIONS);

    expect(sanitized.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
    expect(sanitized.content?.[1]?.content?.[0]?.text).toBe('Watch the oxygen.');
  });

  it('never crashes on an unknown node, and never renders it as an empty tag', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'sillyFutureQuote',
          content: [{ type: 'text', text: 'Hold onto this line.' }],
        },
      ],
    };

    expect(() => renderDocumentMarkdown(doc, EXTENSIONS)).not.toThrow();
    expect(renderDocumentMarkdown(doc, EXTENSIONS)).toContain('Hold onto this line.');

    expect(() => renderStandaloneHtmlDocument(doc, EXTENSIONS, { title: 'Doc' })).not.toThrow();
    expect(renderStandaloneHtmlDocument(doc, EXTENSIONS, { title: 'Doc' })).toContain(
      'Hold onto this line.',
    );
  });

  it('falls back to a placeholder rather than an empty paragraph for a node with no text at all', () => {
    const doc: JSONContent = { type: 'doc', content: [{ type: 'sillyFutureWidget', attrs: {} }] };

    const sanitized = sanitizeDocumentForExport(doc, EXTENSIONS);

    expect(sanitized.content?.[0]?.content?.[0]?.text).toBe('Unsupported content');
  });
});
