'use client';

import type { Document, DocumentContent, Entity } from '@level-zero/domain';
import {
  Button,
  CommentIcon,
  EmptyState,
  Inspector,
  RichTextEditor,
  SaveStatusLabel,
  insertSection,
  useEditorAutosave,
  type AcceptedAiEdit,
  type AiEditingOptions,
  type Editor,
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
import { useProject } from '@/features/projects/use-projects';
import * as api from '@/lib/api';
import { ApiRequestError, apiErrorMessage } from '@/lib/api';

import { recordAcceptedAiEdit } from './ai-edit-version';
import { GddDocumentHeader } from './gdd-document-header';
import { GddHistory } from './gdd-history';
import { GddOutline } from './gdd-outline';
import { GddReview } from './gdd-review';
import { gddDocumentRoute, gddRoute } from './gdd-route';
import { sectionInView } from './scroll-position';
import {
  GDD_DOCUMENT_NAME,
  useCreateGddDocument,
  useGddDocument,
  useGddDocuments,
  useSaveGddDocument,
  useSnapshotGddDocument,
} from './use-gdd-documents';

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
  // The header reads the project — name, description, artwork — it never
  // edits it (renaming the game belongs to project settings), so this is the
  // ordinary read-only query every other project page uses.
  const projectQuery = useProject(projectId);
  const [content, setContent] = useState<JSONContent>(() => designDocument.content as JSONContent);
  // `RichTextEditor` reads `content` only when it is created, so a restore —
  // which replaces the body from outside the editor's own edits — bumps this
  // to force a fresh surface onto the restored writing.
  const [editorKey, setEditorKey] = useState(0);
  const saveDocument = useSaveGddDocument(projectId, documentId);
  const snapshotDocument = useSnapshotGddDocument(projectId, documentId);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // The live TipTap editor, for commands the outline needs to run against it
  // ("+ Add Section") rather than through `content`, which `RichTextEditor`
  // only reads when the surface is created.
  const editorRef = useRef<Editor | null>(null);
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  // Compare is a mode of the document surface rather than a page of its own:
  // the writer stays where they were writing, and the outline steps aside so
  // two versions get the full width.
  const [comparing, setComparing] = useState(false);
  // The contextual AI is about the whole document — the passage-level actions
  // are the editor's own inline layer — so it is a panel the writer opens
  // rather than something docked beside every sentence.
  const [askingAi, setAskingAi] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Review and discussion are a panel in the same slot (#187): the status of
  // the section being written, the states it can be moved through, and the
  // threads on it. The section itself follows the caret.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const entitiesQuery = useReferenceableEntities(projectId);
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);

  // The reference the writer clicked is held by id, not by value, so the panel
  // shows the entity as it is now rather than as it was when it was opened.
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const openEntity = entities.find((entity) => entity.id === openEntityId) ?? null;
  const openReference = useCallback((entity: Entity) => {
    setOpenEntityId(entity.id);
    setAskingAi(false);
    setHistoryOpen(false);
    setReviewOpen(false);
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

  // Addresses the heading by the id the outline gave it, rather than counting
  // `h1, h2, h3` nodes in the DOM: that count only agreed with the outline's
  // own list as long as both were built the same way, which a mixed-level
  // document broke.
  function scrollToSection(sectionId: string) {
    const target = surfaceRef.current?.querySelector<HTMLElement>(
      `[data-section-id="${sectionId}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleAddSection() {
    if (editorRef.current) insertSection(editorRef.current);
  }

  // Which section is "in view" as the writer scrolls, for the outline's own
  // highlight — independent of `.tiptap-surface`'s heading levels, which are
  // presentation and mix freely.
  const updateVisibleSection = useCallback(() => {
    const container = surfaceRef.current;
    if (!container) return;

    const containerTop = container.getBoundingClientRect().top;
    const positions = Array.from(
      container.querySelectorAll<HTMLElement>('.tiptap-surface [data-section-id]'),
    ).map((element) => ({
      id: element.dataset.sectionId ?? '',
      top: element.getBoundingClientRect().top - containerTop + container.scrollTop,
    }));

    setActiveSectionId(sectionInView(positions, container.scrollTop));
  }, []);

  useEffect(() => {
    const container = surfaceRef.current;
    if (!container || comparing) return;

    container.addEventListener('scroll', updateVisibleSection, { passive: true });
    return () => container.removeEventListener('scroll', updateVisibleSection);
  }, [comparing, updateVisibleSection]);

  // Headings move, appear and disappear as the writer types, and none of that
  // fires a scroll event on its own.
  useEffect(() => {
    if (!comparing) updateVisibleSection();
  }, [content, comparing, updateVisibleSection]);

  /**
   * A restore replaces the body from outside the editor's own edits, so the
   * surface is remounted onto it rather than patched in place — the same
   * reason a save round-trip is deliberately never fed back to `content`.
   */
  function handleRestored(restored: DocumentContent) {
    setContent(restored as JSONContent);
    setEditorKey((key) => key + 1);
  }

  // History, Review, Ask AI and Compare share one inspector-and-mode slot, so
  // opening one closes whatever else was open rather than stacking on top of it.
  function toggleHistory() {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) {
        setAskingAi(false);
        setReviewOpen(false);
        setOpenEntityId(null);
      }
      return next;
    });
  }

  function toggleAskingAi() {
    setAskingAi((current) => {
      const next = !current;
      if (next) {
        setHistoryOpen(false);
        setReviewOpen(false);
        setOpenEntityId(null);
      }
      return next;
    });
  }

  function toggleReview() {
    setReviewOpen((current) => {
      const next = !current;
      if (next) {
        setHistoryOpen(false);
        setAskingAi(false);
        setOpenEntityId(null);
      }
      return next;
    });
  }

  function toggleComparing() {
    setComparing((current) => {
      const next = !current;
      if (next) {
        setHistoryOpen(false);
        setAskingAi(false);
        setReviewOpen(false);
        setOpenEntityId(null);
      }
      return next;
    });
  }

  return (
    <EntityReferenceProvider
      entities={entities}
      isPending={entitiesQuery.isPending}
      onOpen={openReference}
      projectId={projectId}
    >
      <div className="flex h-full min-h-0">
        {!comparing && (
          <GddOutline
            projectId={projectId}
            documentId={documentId}
            content={content}
            activeSectionId={activeSectionId}
            canAddSection={!archived}
            onSelect={(entry) => {
              if (entry.id === null) return;
              setActiveSectionId(entry.id);
              scrollToSection(entry.id);
            }}
            onAddSection={handleAddSection}
          />
        )}

        <div ref={surfaceRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <GddDocumentHeader
            projectId={projectId}
            project={projectQuery.data}
            documentEntity={designDocument.entity}
            currentVersion={designDocument.currentVersion}
            archived={archived}
            comparing={comparing}
            onToggleCompare={toggleComparing}
            onToggleHistory={toggleHistory}
            onToggleReview={toggleReview}
            onToggleAskAi={toggleAskingAi}
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
                  key={editorKey}
                  mode="document"
                  label="Game design document"
                  content={content}
                  onChange={handleChange}
                  onSectionChange={setActiveSectionId}
                  onEditorReady={(instance) => {
                    editorRef.current = instance;
                  }}
                  editable={!archived}
                  extensions={referenceExtensions}
                  commands={ENTITY_EMBED_COMMANDS}
                  ai={archived ? undefined : aiEditing}
                  toolbarActions={
                    <>
                      {/* The mockup's toolbar Comment button: it opens the
                          review panel on whichever section the caret is in. */}
                      <Button variant="ghost" size="sm" onClick={toggleReview}>
                        <CommentIcon className="size-4" />
                        Comment
                      </Button>
                      <SaveStatusLabel status={autosave.status} error={autosave.error} />
                    </>
                  }
                />
                {aiEditError && (
                  <p role="status" className="mt-2 text-xs text-error">
                    {aiEditError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {openEntity && !comparing && (
          <EntityReferenceInspector entity={openEntity} onClose={() => setOpenEntityId(null)} />
        )}

        {!openEntity && reviewOpen && !comparing && (
          <Inspector
            title="Review"
            description={designDocument.entity.name}
            onClose={() => setReviewOpen(false)}
          >
            <GddReview
              projectId={projectId}
              documentId={documentId}
              documentName={designDocument.entity.name}
              content={content}
              activeSectionId={activeSectionId}
              onSelectSection={setActiveSectionId}
            />
          </Inspector>
        )}

        {!openEntity && !reviewOpen && askingAi && !comparing && !archived && (
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

        {!openEntity && !reviewOpen && !askingAi && historyOpen && !comparing && (
          <Inspector
            title="History"
            description={designDocument.entity.name}
            onClose={() => setHistoryOpen(false)}
          >
            <GddHistory
              projectId={projectId}
              documentId={documentId}
              archived={archived}
              flush={flush}
              onCompare={() => {
                setComparing(true);
                setHistoryOpen(false);
              }}
              onRestored={handleRestored}
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
