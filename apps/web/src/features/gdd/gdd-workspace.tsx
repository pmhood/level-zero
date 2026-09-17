'use client';

import type { Document, Entity } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  Inspector,
  RichTextEditor,
  SaveStatusLabel,
  SparklesIcon,
  StatusBadge,
  WorkspaceHeader,
  useEditorAutosave,
  type AcceptedAiEdit,
  type AiEditingOptions,
  type JSONContent,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AiInspector } from '@/features/ai-inspector/ai-inspector';
import { matchEntities, referencedEntityIds } from '@/features/entities/entity-reference';
import { EntityVersionCompare } from '@/features/entities/entity-version-compare';
import { EntityReferenceProvider } from '@/features/entities/entity-reference-context';
import {
  createEntityReferenceExtensions,
  ENTITY_EMBED_COMMANDS,
} from '@/features/entities/entity-reference-extensions';
import { EntityReferenceInspector } from '@/features/entities/entity-reference-inspector';
import { useReferenceableEntities } from '@/features/entities/use-entities';
import * as api from '@/lib/api';
import { ApiRequestError, apiErrorMessage } from '@/lib/api';

import { recordAcceptedAiEdit } from './ai-edit-version';
import { documentOutline } from './document-outline';
import { DocumentSwitcher } from './document-switcher';
import { gddDocumentRoute, gddRoute } from './gdd-route';
import {
  GDD_DOCUMENT_NAME,
  useCreateGddDocument,
  useGddDocument,
  useGddDocuments,
  useSaveGddDocument,
  useSnapshotGddDocument,
} from './use-gdd-documents';

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
  const documentId = designDocument.entity.id;
  // Archived is the entity's, same rule the domain enforces server-side
  // (`applyEntityUpdate`, "an archived entity must be restored before it can
  // be edited"): the surface goes read-only rather than letting a save fail
  // silently after the fact.
  const archived = designDocument.entity.status === 'archived';
  const [content, setContent] = useState<JSONContent>(() => designDocument.content as JSONContent);
  const saveDocument = useSaveGddDocument(projectId, documentId);
  const snapshotDocument = useSnapshotGddDocument(projectId, documentId);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  // Compare is a mode of the document surface rather than a page of its own:
  // the writer stays where they were writing, and the outline steps aside so
  // two versions get the full width.
  const [comparing, setComparing] = useState(false);
  // The contextual AI is about the whole document — the passage-level actions
  // are the editor's own inline layer — so it is a panel the writer opens
  // rather than something docked beside every sentence.
  const [askingAi, setAskingAi] = useState(false);

  const entitiesQuery = useReferenceableEntities(projectId);
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);

  // The reference the writer clicked is held by id, not by value, so the panel
  // shows the entity as it is now rather than as it was when it was opened.
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const openEntity = entities.find((entity) => entity.id === openEntityId) ?? null;
  const openReference = useCallback((entity: Entity) => {
    setOpenEntityId(entity.id);
    setAskingAi(false);
  }, []);

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

  // Autosave is the only writer to the document body, so an accepted edit is
  // versioned by flushing it rather than by saving a second copy alongside.
  const flush = autosave.flush;
  const recordAiEdit = useCallback(
    async (edit: AcceptedAiEdit) => {
      try {
        await recordAcceptedAiEdit(edit, flush, (input) => snapshotDocument.mutateAsync(input));
        setAiEditError(null);
      } catch (error) {
        setAiEditError(apiErrorMessage(error, 'The AI edit was applied but not versioned.'));
      }
    },
    [flush, snapshotDocument],
  );

  const aiEditing = useMemo<AiEditingOptions>(
    () => ({
      suggest: async ({ action, instruction, selection, references, signal }) => {
        const { generationId, suggestion } = await api.suggestDocumentEdit(
          projectId,
          documentId,
          {
            action,
            instruction,
            selection,
            mentionedEntityIds: referencedEntityIds(references),
          },
          signal,
        );
        return { text: suggestion, generationId };
      },
      onAccept: (edit) => void recordAiEdit(edit),
    }),
    [projectId, documentId, recordAiEdit],
  );

  function handleChange(next: JSONContent) {
    setContent(next);
    autosave.onChange(next);
  }

  function scrollToHeading(index: number) {
    const headings = surfaceRef.current?.querySelectorAll('.tiptap-surface :is(h1, h2, h3)');
    headings?.item(index)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * A version is of what the server holds, so whatever is still waiting in
   * autosave has to land before the snapshot is taken.
   */
  async function saveVersion() {
    try {
      await autosave.flush();
      await snapshotDocument.mutateAsync({});
      setVersionError(null);
    } catch (error) {
      setVersionError(apiErrorMessage(error, 'Could not save a version.'));
    }
  }

  return (
    <EntityReferenceProvider
      entities={entities}
      isPending={entitiesQuery.isPending}
      onOpen={openReference}
      projectId={projectId}
    >
      <div className="flex h-full min-h-0">
        {!comparing && <DocumentOutline content={content} onSelect={scrollToHeading} />}

        <div ref={surfaceRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <WorkspaceHeader
            title="GDD"
            description="The canonical written design. Reference entities instead of restating them."
            actions={
              <div className="flex items-center gap-2">
                <DocumentSwitcher projectId={projectId} current={designDocument.entity} />
                {archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
                <Button variant="secondary" size="sm" onClick={() => setComparing(!comparing)}>
                  {comparing ? 'Back to writing' : 'Compare versions'}
                </Button>
                {!archived && (
                  <Button
                    variant="ai"
                    size="sm"
                    onClick={() => {
                      setAskingAi(!askingAi);
                      setOpenEntityId(null);
                    }}
                  >
                    <SparklesIcon className="size-4" />
                    Ask AI
                  </Button>
                )}
              </div>
            }
          />

          <div
            className={
              comparing
                ? 'w-full px-4 pb-16 xl:px-5 2xl:px-6'
                : 'w-full max-w-[860px] px-4 pb-16 xl:px-5 2xl:px-6'
            }
          >
            {comparing ? (
              <EntityVersionCompare projectId={projectId} entity={designDocument.entity} />
            ) : (
              <>
                <RichTextEditor
                  mode="document"
                  label="Game design document"
                  content={content}
                  onChange={handleChange}
                  editable={!archived}
                  extensions={referenceExtensions}
                  commands={ENTITY_EMBED_COMMANDS}
                  ai={archived ? undefined : aiEditing}
                  toolbarActions={
                    <>
                      <SaveStatusLabel status={autosave.status} error={autosave.error} />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={snapshotDocument.isPending}
                        onClick={() => void saveVersion()}
                      >
                        {snapshotDocument.isPending ? 'Saving…' : 'Save a version'}
                      </Button>
                    </>
                  }
                />
                {aiEditError && (
                  <p role="status" className="mt-2 text-xs text-error">
                    {aiEditError}
                  </p>
                )}
                {versionError && (
                  <p role="status" className="mt-2 text-xs text-error">
                    {versionError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {openEntity && !comparing && (
          <EntityReferenceInspector entity={openEntity} onClose={() => setOpenEntityId(null)} />
        )}

        {!openEntity && askingAi && !comparing && !archived && (
          <Inspector
            title={designDocument.entity.name}
            description="Design document"
            onClose={() => setAskingAi(false)}
          >
            <AiInspector
              projectId={projectId}
              subject={{ kind: 'entity', entity: designDocument.entity }}
            />
          </Inspector>
        )}
      </div>
    </EntityReferenceProvider>
  );
}

/**
 * `/projects/:projectId/gdd`, with no document id (#182): opens the most
 * recently updated document, or — a project with none at all — offers to
 * start the first one. Never the empty state a missing document used to mean;
 * that is now `GddDocumentRoute`'s 404, for an id that names nothing.
 */
function GddIndexRoute({ projectId }: { projectId: string }) {
  const router = useRouter();
  const documentsQuery = useGddDocuments(projectId);
  const mostRecent = documentsQuery.data?.items[0] ?? null;

  useEffect(() => {
    if (mostRecent) router.replace(gddDocumentRoute(projectId, mostRecent.id) as Route);
  }, [mostRecent, projectId, router]);

  if (documentsQuery.isPending || mostRecent) {
    return <p className="p-6 text-sm text-muted-foreground">Loading the design document…</p>;
  }

  if (documentsQuery.isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load the project's documents"
          description={apiErrorMessage(documentsQuery.error)}
          actions={
            <Button variant="secondary" onClick={() => documentsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return <GddEmptyIndex projectId={projectId} />;
}

/**
 * No document survived `includeArchived: false` — either the project has
 * never had one, or every one it had is archived. The two read the same to a
 * writer ("nothing to open") but not to someone chasing a document they
 * archived, so archived documents get a quiet way back in rather than
 * disappearing until someone remembers "Show archived" exists.
 */
function GddEmptyIndex({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createDocument = useCreateGddDocument(projectId);
  const archivedQuery = useGddDocuments(projectId, { includeArchived: true });
  const archived = (archivedQuery.data?.items ?? []).filter((item) => item.status === 'archived');

  function startDocument() {
    createDocument.mutate(GDD_DOCUMENT_NAME, {
      onSuccess: (document) =>
        router.replace(gddDocumentRoute(projectId, document.entity.id) as Route),
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <EmptyState
        title="No documents yet"
        description="A project holds as many design documents as it needs. Start with the pillars, the core loop and the systems as they settle."
        actions={
          <Button onClick={startDocument} disabled={createDocument.isPending}>
            {createDocument.isPending ? 'Creating…' : 'Start a document'}
          </Button>
        }
      />

      {archived.length > 0 && (
        <div className="max-w-sm">
          <p className="text-xs font-medium text-muted-foreground">Archived documents</p>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((document) => (
              <li key={document.id}>
                <Link
                  href={gddDocumentRoute(projectId, document.id) as Route}
                  className="text-sm text-primary hover:underline"
                >
                  {document.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** `/projects/:projectId/gdd/:documentId` (#182): one document, by id. */
function GddDocumentRoute({ projectId, documentId }: { projectId: string; documentId: string }) {
  const documentQuery = useGddDocument(projectId, documentId);

  if (documentQuery.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading the design document…</p>;
  }

  if (documentQuery.isError) {
    const notFound =
      documentQuery.error instanceof ApiRequestError && documentQuery.error.status === 404;

    return (
      <div className="p-6">
        <EmptyState
          title={notFound ? 'Document not found' : "Couldn't load this document"}
          description={
            notFound
              ? "This document doesn't exist, or you don't have access to it."
              : apiErrorMessage(documentQuery.error)
          }
          actions={
            <Button asChild variant="secondary">
              <Link href={gddRoute(projectId) as Route}>Back to documents</Link>
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

export function GddWorkspace({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId?: string;
}) {
  if (documentId) {
    return <GddDocumentRoute projectId={projectId} documentId={documentId} />;
  }
  return <GddIndexRoute projectId={projectId} />;
}
