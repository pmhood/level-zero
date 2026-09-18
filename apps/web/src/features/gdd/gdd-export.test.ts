// @vitest-environment jsdom
import type { Entity } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  documentExportFilename,
  exportGddDocument,
  renderGddDocumentHtml,
  renderGddDocumentMarkdown,
} from './gdd-export';

const PROJECT_ID = 'prj_1';

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function heading(text: string): JSONContent {
  return { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] };
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

afterEach(() => vi.restoreAllMocks());

describe('documentExportFilename', () => {
  it('lowercases and hyphenates the document name', () => {
    expect(documentExportFilename('Game Design Document', 'md')).toBe('game-design-document.md');
  });

  it('drops punctuation rather than turning it into hyphens', () => {
    expect(documentExportFilename("Kael's Story!", 'html')).toBe('kaels-story.html');
  });

  it('collapses runs of whitespace and stray characters into one hyphen', () => {
    expect(documentExportFilename('Core Loop  //  Draft 2', 'md')).toBe('core-loop-draft-2.md');
  });

  it('falls back to a generic name for a document with nothing nameable in it', () => {
    expect(documentExportFilename('!!!', 'md')).toBe('document.md');
  });
});

describe('renderGddDocumentMarkdown and renderGddDocumentHtml', () => {
  const content = doc(heading('Driftwake'), paragraph('A salvage crew, out of air.'));

  it('render the document without touching the input', () => {
    const before = JSON.stringify(content);

    const markdown = renderGddDocumentMarkdown({ content, projectId: PROJECT_ID, entities: [] });
    const html = renderGddDocumentHtml({
      content,
      projectId: PROJECT_ID,
      entities: [],
      title: 'Driftwake',
    });

    expect(markdown).toContain('# Driftwake');
    expect(markdown).toContain('A salvage crew, out of air.');
    expect(html).toContain('<h1');
    expect(html).toContain('A salvage crew, out of air.');
    expect(JSON.stringify(content)).toBe(before);
  });

  it('resolves entity mentions against the entities passed in, not a stale copy', () => {
    const kael: Entity = {
      id: 'ent_kael',
      projectId: PROJECT_ID,
      type: 'character',
      name: 'Kael Voss',
      description: null,
      status: 'active',
      tags: [],
      data: {},
      currentVersionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };
    const mention = {
      type: 'entityMention',
      attrs: { entityId: kael.id, entityType: kael.type, label: kael.name },
    };

    const markdown = renderGddDocumentMarkdown({
      content: doc({ type: 'paragraph', content: [mention] }),
      projectId: PROJECT_ID,
      entities: [kael],
    });

    expect(markdown).toContain(`[Kael Voss](/projects/${PROJECT_ID}/entities/${kael.id})`);
  });
});

describe('exportGddDocument', () => {
  function stubDownload() {
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    const revokeObjectURL = vi.fn((_url: string) => {});
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });

    return { anchor, click, createObjectURL, revokeObjectURL };
  }

  it('downloads a .md file named for the document when exporting Markdown', () => {
    const { anchor, click, createObjectURL, revokeObjectURL } = stubDownload();

    exportGddDocument({
      format: 'markdown',
      content: doc(paragraph('Body text.')),
      projectId: PROJECT_ID,
      entities: [],
      documentName: 'Combat Brief',
    });

    expect(anchor.download).toBe('combat-brief.md');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]![0].type).toContain('text/markdown');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('downloads a .html file named for the document when exporting HTML', () => {
    const { anchor, createObjectURL } = stubDownload();

    exportGddDocument({
      format: 'html',
      content: doc(paragraph('Body text.')),
      projectId: PROJECT_ID,
      entities: [],
      documentName: 'Combat Brief',
    });

    expect(anchor.download).toBe('combat-brief.html');
    expect(createObjectURL.mock.calls[0]![0].type).toContain('text/html');
  });

  it('never mutates the document it exports', () => {
    stubDownload();
    const content = doc(paragraph('Body text.'));
    const before = JSON.stringify(content);

    exportGddDocument({
      format: 'markdown',
      content,
      projectId: PROJECT_ID,
      entities: [],
      documentName: 'Combat Brief',
    });

    expect(JSON.stringify(content)).toBe(before);
  });
});
