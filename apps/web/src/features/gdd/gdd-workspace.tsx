'use client';

import type { Document, Entity } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  RichTextEditor,
  SaveStatusLabel,
  WorkspaceHeader,
  useEditorAutosave,
  type JSONContent,
} from '@level-zero/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { matchEntities } from '@/features/entities/entity-reference';
import { EntityReferenceProvider } from '@/features/entities/entity-reference-context';
import {
  createEntityReferenceExtensions,
  ENTITY_EMBED_COMMANDS,
} from '@/features/entities/entity-reference-extensions';
import { EntityReferenceInspector } from '@/features/entities/entity-reference-inspector';
import { useReferenceableEntities } from '@/features/entities/use-entities';
import { ApiRequestError } from '@/lib/api';

import { documentOutline } from './document-outline';
import { useCreateGddDocument, useGddDocument, useSaveGddDocument } from './use-gdd-document';

function DocumentOutline({
  content,
  onSelect,
}: {
  content: JSONContent | null;
  onSelect: (index: number) => void;
}) {
  const headings = useMemo(() => documentOutline(content), [content]);

  return (
    <nav
      aria-label="Document outline"
      className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-border-subtle px-3 py-5 lg:block"
    >
      <p className="px-2 text-xs font-medium text-muted-foreground">Contents</p>
      {headings.length === 0 ? (
        <p className="mt-2 px-2 text-xs text-faint-foreground">
          Headings you add show up here as the document&rsquo;s outline.
        </p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {headings.map((heading, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                className="w-full truncate rounded-md py-1 pr-2 text-left text-xs text-muted-foreground hover:bg-hover hover:text-foreground"
              >
                {heading.text || 'Untitled section'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function GddDocumentEditor({
  projectId,
  designDocument,
}: {
  projectId: string;
  designDocument: Document;
}) {
  // The stored body is a document node; the editor reads it as TipTap JSON.
  const [content, setContent] = useState<JSONContent>(() => designDocument.content as JSONContent);
  const saveDocument = useSaveGddDocument(projectId, designDocument.entity.id);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const entitiesQuery = useReferenceableEntities(projectId);
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);

  // The reference the writer clicked is held by id, not by value, so the panel
  // shows the entity as it is now rather than as it was when it was opened.
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const openEntity = entities.find((entity) => entity.id === openEntityId) ?? null;
  const openReference = useCallback((entity: Entity) => setOpenEntityId(entity.id), []);

  // The `@` menu is built once with the editor, but has to search the entities
  // as they are now — so it reads the list through a ref, the same way the
  // editor holds its change handler.
  const entitiesRef = useRef(entities);
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  const [referenceExtensions] = useState(() =>
    createEntityReferenceExtensions((query) => matchEntities(entitiesRef.current, query)),
  );

  const save = useCallback(
    (content: JSONContent) => saveDocument.mutateAsync(content),
    [saveDocument],
  );
  const autosave = useEditorAutosave(save);

  function handleChange(next: JSONContent) {
    setContent(next);
    autosave.onChange(next);
  }

  function scrollToHeading(index: number) {
    const headings = surfaceRef.current?.querySelectorAll('.tiptap-surface :is(h1, h2, h3)');
    headings?.item(index)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <EntityReferenceProvider
      entities={entities}
      isPending={entitiesQuery.isPending}
      onOpen={openReference}
    >
      <div className="flex h-full min-h-0">
        <DocumentOutline content={content} onSelect={scrollToHeading} />

        <div ref={surfaceRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <WorkspaceHeader
            title="GDD"
            description="The canonical written design. Reference entities instead of restating them."
          />

          <div className="w-full max-w-[860px] px-4 pb-16 xl:px-5 2xl:px-6">
            <RichTextEditor
              mode="document"
              label="Game design document"
              content={content}
              onChange={handleChange}
              extensions={referenceExtensions}
              commands={ENTITY_EMBED_COMMANDS}
              toolbarActions={<SaveStatusLabel status={autosave.status} error={autosave.error} />}
            />
          </div>
        </div>

        {openEntity && (
          <EntityReferenceInspector entity={openEntity} onClose={() => setOpenEntityId(null)} />
        )}
      </div>
    </EntityReferenceProvider>
  );
}

export function GddWorkspace({ projectId }: { projectId: string }) {
  const documentQuery = useGddDocument(projectId);
  const createDocument = useCreateGddDocument(projectId);

  if (documentQuery.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading the design document…</p>;
  }

  if (documentQuery.isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load the design document"
          description={
            documentQuery.error instanceof ApiRequestError
              ? documentQuery.error.message
              : 'Something went wrong talking to the API.'
          }
          actions={
            <Button variant="secondary" onClick={() => documentQuery.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!documentQuery.data) {
    return (
      <div className="p-6">
        <EmptyState
          title="No design document yet"
          description="Start the GDD and write the pillars, the core loop and the systems as they settle."
          actions={
            <Button onClick={() => createDocument.mutate()} disabled={createDocument.isPending}>
              {createDocument.isPending ? 'Creating…' : 'Start the GDD'}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <GddDocumentEditor
      key={documentQuery.data.entity.id}
      projectId={projectId}
      designDocument={documentQuery.data}
    />
  );
}
