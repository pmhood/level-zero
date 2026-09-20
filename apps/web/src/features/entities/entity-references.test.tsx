// @vitest-environment jsdom
import type { Entity, EntityStatus, EntityType } from '@level-zero/domain';
import {
  createEditorExtensions,
  renderDocumentMarkdown,
  renderStandaloneHtmlDocument,
  RichTextEditor,
  type JSONContent,
} from '@level-zero/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { entityRoute } from '@/features/entity-detail/entity-route';

import { insertEntityMention } from './entity-mention';
import {
  ENTITY_EMBED_NODE,
  ENTITY_MENTION_NODE,
  resolveEntityReferencesForExport,
} from './entity-reference';
import { EntityReferenceProvider } from './entity-reference-context';
import {
  createEntityReferenceExtensions,
  ENTITY_EMBED_COMMANDS,
} from './entity-reference-extensions';

function entity(
  id: string,
  name: string,
  type: EntityType = 'character',
  status: EntityStatus = 'active',
): Entity {
  return {
    id,
    projectId: 'prj_1',
    type,
    name,
    description: 'Salvager, forty, out of air.',
    status,
    tags: ['Survival'],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const KAEL = entity('ent_kael', 'Kael Voss');
const OXYGEN = entity('ent_oxygen', 'Oxygen Management', 'mechanic');
const DRIFT = entity('ent_drift', 'Driftwake Station', 'location');

/** A headless editor with the same extension set the GDD surface runs. */
function createEditor(content?: JSONContent): Editor {
  return new Editor({
    extensions: [
      ...createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
      ...createEntityReferenceExtensions(() => [KAEL, OXYGEN, DRIFT]),
    ],
    content,
  });
}

function mention(entityReference: Entity): JSONContent {
  return {
    type: ENTITY_MENTION_NODE,
    attrs: {
      entityId: entityReference.id,
      entityType: entityReference.type,
      label: entityReference.name,
    },
  };
}

function embed(entityReference: Entity): JSONContent {
  return {
    type: ENTITY_EMBED_NODE,
    attrs: {
      entityId: entityReference.id,
      entityType: entityReference.type,
      label: entityReference.name,
    },
  };
}

function documentWith(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function Harness({
  content,
  entities,
  isPending = false,
  onChange,
  onOpen = () => {},
  projectId,
}: {
  content: JSONContent;
  entities: Entity[];
  isPending?: boolean;
  onChange?: (content: JSONContent) => void;
  onOpen?: (entity: Entity) => void;
  projectId?: string;
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <EntityReferenceProvider
        entities={entities}
        isPending={isPending}
        onOpen={onOpen}
        projectId={projectId}
      >
        <RichTextEditor
          label="Game design document"
          content={content}
          onChange={onChange}
          extensions={createEntityReferenceExtensions(() => entities)}
          commands={ENTITY_EMBED_COMMANDS}
        />
      </EntityReferenceProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe('writing a reference', () => {
  it('stores the id and the type, not a copy of the entity', () => {
    const editor = createEditor();

    insertEntityMention(editor, { from: 1, to: 1 }, KAEL);

    const paragraph = editor.getJSON().content?.[0];
    expect(paragraph?.content?.[0]).toEqual(mention(KAEL));

    editor.destroy();
  });

  it('offers one `/` command per referenceable type and inserts an empty card', () => {
    const editor = createEditor();
    const command = ENTITY_EMBED_COMMANDS.find((entry) => entry.id === 'embed-mechanic');

    expect(ENTITY_EMBED_COMMANDS.map((entry) => entry.title)).toContain('Character embed');
    command?.run(editor, { from: 1, to: 1 });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: ENTITY_EMBED_NODE,
      attrs: { entityId: null, entityType: 'mechanic' },
    });

    editor.destroy();
  });

  it('keeps mentions and embeds through the persisted JSON round trip', () => {
    const source = createEditor(
      documentWith(
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Air runs out for ' }, mention(KAEL)],
        },
        embed(OXYGEN),
      ),
    );

    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  it('exports to Markdown with the name the reference was written with', () => {
    const editor = createEditor(
      documentWith({ type: 'paragraph', content: [mention(KAEL)] }, embed(OXYGEN)),
    );

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('@Kael Voss');
    expect(markdown).toContain('@Oxygen Management');

    editor.destroy();
  });
});

describe('rendering a reference', () => {
  it('mentions a character, a mechanic and a location inline', async () => {
    render(
      <Harness
        entities={[KAEL, OXYGEN, DRIFT]}
        content={documentWith({
          type: 'paragraph',
          content: [mention(KAEL), mention(OXYGEN), mention(DRIFT)],
        })}
      />,
    );

    await screen.findByRole('button', { name: 'Kael Voss' });
    expect(screen.getByRole('button', { name: 'Oxygen Management' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Driftwake Station' })).toBeDefined();
  });

  it('renders a mechanic as a block embed with its type and status', async () => {
    render(<Harness entities={[OXYGEN]} content={documentWith(embed(OXYGEN))} />);

    await screen.findByRole('heading', { name: 'Oxygen Management' });
    expect(screen.getByText('Mechanic')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('shows the entity type, status and current fields on hover', async () => {
    render(
      <Harness
        entities={[KAEL]}
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    const chip = await screen.findByRole('button', { name: 'Kael Voss' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(chip.parentElement!);

    const preview = await screen.findByRole('tooltip');
    expect(preview.textContent).toContain('Character');
    expect(preview.textContent).toContain('Active');
    expect(preview.textContent).toContain('Salvager, forty, out of air.');
  });

  it('opens the canonical entity when a mention is clicked', async () => {
    const onOpen = vi.fn();
    render(
      <Harness
        entities={[KAEL]}
        onOpen={onOpen}
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Kael Voss' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(KAEL);
  });

  // The regression risk (docs/decisions/canonical-entity-routes.md §9): a
  // chip click must keep opening the inspector beside the document, never
  // navigate away from it. Only the hover preview's Open button, which is a
  // real link, goes to the canonical route.
  it('keeps a chip click opening the inspector, and only the preview Open link navigates', async () => {
    const onOpen = vi.fn();
    render(
      <Harness
        entities={[KAEL]}
        onOpen={onOpen}
        projectId="prj_1"
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    const chip = await screen.findByRole('button', { name: 'Kael Voss' });
    expect(chip.hasAttribute('href')).toBe(false);

    fireEvent.click(chip);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(KAEL);

    onOpen.mockClear();
    fireEvent.mouseEnter(chip.parentElement!);
    const openLink = await screen.findByRole('link', { name: 'Open' });

    // A real anchor: reachable by Tab and activated by Enter/Space like any
    // other browser link, with no bespoke keydown handling to get wrong.
    expect(openLink.tagName).toBe('A');
    expect(openLink.getAttribute('href')).toBe('/projects/prj_1/entities/ent_kael');

    fireEvent.click(openLink);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('waits instead of showing a break while the entities are still loading', async () => {
    render(
      <Harness
        entities={[]}
        isPending
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    await screen.findByRole('button', { name: 'Kael Voss' });
    expect(screen.queryByRole('button', { name: /Broken reference/ })).toBeNull();
  });
});

describe('when the entity changes', () => {
  it('renders the new name after a rename without rewriting the document', async () => {
    const onChange = vi.fn();
    const content = documentWith({ type: 'paragraph', content: [mention(KAEL)] });
    const { rerender } = render(
      <Harness entities={[KAEL]} content={content} onChange={onChange} />,
    );

    await screen.findByRole('button', { name: 'Kael Voss' });

    rerender(
      <Harness
        entities={[{ ...KAEL, name: 'Kael Ardent' }]}
        content={content}
        onChange={onChange}
      />,
    );

    await screen.findByRole('button', { name: 'Kael Ardent' });
    expect(screen.queryByRole('button', { name: 'Kael Voss' })).toBeNull();
    // The stored JSON only ever held the id, so nothing was saved.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks an archived entity rather than breaking the reference', async () => {
    const archived = { ...KAEL, status: 'archived' as const };
    render(
      <Harness
        entities={[archived]}
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    const chip = await screen.findByRole('button', { name: 'Kael Voss' });
    expect(chip.textContent).toContain('(archived)');
  });

  it('shows a missing mention as a broken reference that can be removed', async () => {
    const onChange = vi.fn();
    render(
      <Harness
        entities={[]}
        onChange={onChange}
        content={documentWith({ type: 'paragraph', content: [mention(KAEL)] })}
      />,
    );

    // Visible: the reference still says which character it pointed at.
    const chip = await screen.findByRole('button', {
      name: 'Broken reference to a missing character',
    });
    expect(chip.textContent).toContain('Kael Voss');

    // Repairable: removing it is one click, and the document is what changes.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the broken reference to Kael Voss' }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = onChange.mock.calls.at(-1)?.[0] as JSONContent;
    expect(JSON.stringify(saved)).not.toContain(ENTITY_MENTION_NODE);
  });

  it('lets a missing embed be pointed at another entity of the same type', async () => {
    const onChange = vi.fn();
    const deleted = entity('ent_gone', 'Air Budget', 'mechanic');
    render(
      <Harness entities={[OXYGEN]} onChange={onChange} content={documentWith(embed(deleted))} />,
    );

    await screen.findByText('Missing');
    fireEvent.click(screen.getByRole('button', { name: 'Choose another' }));

    fireEvent.click(await screen.findByRole('option', { name: /Oxygen Management/ }));

    await screen.findByRole('heading', { name: 'Oxygen Management' });
    const saved = onChange.mock.calls.at(-1)?.[0] as JSONContent;
    expect(saved.content?.[0]?.attrs?.entityId).toBe(OXYGEN.id);
  });
});

describe('exporting a reference (issue #190)', () => {
  const ARCHIVED_DRIFT = entity('ent_drift', 'Driftwake Station', 'location', 'archived');
  const PROJECT_ID = 'prj_1';

  // The same pipeline `renderGddDocumentMarkdown`/`renderGddDocumentHtml` run
  // for a real export: resolve mentions and embeds against `entities` first,
  // then hand the result to a plain schema that has never heard of either.
  const EXTENSIONS = createEditorExtensions({ placeholder: 'Write…', slashMenu: false });

  function markdownFor(content: JSONContent, entities: Entity[]): string {
    const resolved = resolveEntityReferencesForExport(content, entities, PROJECT_ID);
    return renderDocumentMarkdown(resolved, EXTENSIONS);
  }

  function htmlFor(content: JSONContent, entities: Entity[]): string {
    const resolved = resolveEntityReferencesForExport(content, entities, PROJECT_ID);
    return renderStandaloneHtmlDocument(resolved, EXTENSIONS, { title: 'Export' });
  }

  describe('a mention', () => {
    it('exports the entity’s current name, linked to its canonical route', () => {
      const doc = documentWith({ type: 'paragraph', content: [mention(KAEL)] });

      expect(markdownFor(doc, [KAEL])).toContain(
        `[Kael Voss](${entityRoute(PROJECT_ID, KAEL.id)})`,
      );
      expect(htmlFor(doc, [KAEL])).toMatch(
        new RegExp(`<a[^>]*href="${entityRoute(PROJECT_ID, KAEL.id)}"[^>]*>Kael Voss</a>`),
      );
    });

    it('exports a renamed entity under its current name, not the name it was written with', () => {
      const renamed = { ...KAEL, name: 'Kael, Salvage Lead' };
      const doc = documentWith({ type: 'paragraph', content: [mention(KAEL)] });

      expect(markdownFor(doc, [renamed])).toContain('Kael, Salvage Lead');
      expect(markdownFor(doc, [renamed])).not.toContain('[Kael Voss]');
    });

    it('says so when the entity is archived, without hiding the link', () => {
      const doc = documentWith({ type: 'paragraph', content: [mention(ARCHIVED_DRIFT)] });

      expect(markdownFor(doc, [ARCHIVED_DRIFT])).toContain(
        `[Driftwake Station (archived)](${entityRoute(PROJECT_ID, ARCHIVED_DRIFT.id)})`,
      );
      expect(htmlFor(doc, [ARCHIVED_DRIFT])).toContain('Driftwake Station (archived)');
    });

    it('says so honestly when the entity no longer exists, and does not link anywhere', () => {
      const doc = documentWith({ type: 'paragraph', content: [mention(KAEL)] });

      const markdown = markdownFor(doc, []);
      expect(markdown).toContain('Missing character');
      expect(markdown).not.toContain('](');

      const html = htmlFor(doc, []);
      expect(html).toContain('Missing character');
      expect(html).not.toContain('<a ');
    });
  });

  describe('an embed', () => {
    it('exports the entity’s name, type and description, linked to its canonical route', () => {
      const doc = documentWith(embed(OXYGEN));

      const markdown = markdownFor(doc, [OXYGEN]);
      expect(markdown).toContain(`[Oxygen Management](${entityRoute(PROJECT_ID, OXYGEN.id)})`);
      expect(markdown).toContain('Mechanic');
      expect(markdown).toContain(OXYGEN.description);

      const html = htmlFor(doc, [OXYGEN]);
      expect(html).toMatch(
        new RegExp(
          `<a[^>]*href="${entityRoute(PROJECT_ID, OXYGEN.id)}"[^>]*>Oxygen Management</a>`,
        ),
      );
      expect(html).toContain(OXYGEN.description);
    });

    it('says so when the embedded entity is archived', () => {
      const doc = documentWith(embed(ARCHIVED_DRIFT));

      expect(markdownFor(doc, [ARCHIVED_DRIFT])).toContain('(archived)');
      expect(htmlFor(doc, [ARCHIVED_DRIFT])).toContain('(archived)');
    });

    it('says so honestly when the referenced entity no longer exists', () => {
      const doc = documentWith(embed(OXYGEN));

      expect(markdownFor(doc, [])).toContain('Missing mechanic');
      expect(htmlFor(doc, [])).toContain('Missing mechanic');
    });

    it('says so honestly when the embed was never filled in', () => {
      const doc = documentWith({
        type: ENTITY_EMBED_NODE,
        attrs: { entityId: null, entityType: 'character', label: null },
      });

      expect(markdownFor(doc, [])).toContain('No character chosen');
      expect(htmlFor(doc, [])).toContain('No character chosen');
    });
  });
});
