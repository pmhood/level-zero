'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Checkbox, ChevronDownIcon, HistoryIcon, Input, cn } from '@level-zero/ui';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { gddDocumentRoute } from './gdd-route';
import {
  useArchiveGddDocument,
  useCreateGddDocument,
  useDuplicateGddDocument,
  useGddDocuments,
  useRenameGddDocument,
  useRestoreGddDocument,
} from './use-gdd-documents';

/**
 * Which document is open, and everything #182 asked the workspace to do about
 * documents as a set: switch, create, rename, duplicate, archive, restore.
 *
 * A popover rather than a rail: the GDD editor's three columns (spec section
 * 35 — table of contents, document, AI drafting) are already spoken for, and
 * this is a control over *which* document fills the middle one, not a fourth
 * column. Rename, duplicate and archive/restore act on `current` — the
 * document already open — because that is the one a writer reaches for these
 * from; switching to another document first is one click away in the same
 * list.
 */
export function DocumentSwitcher({ projectId, current }: { projectId: string; current: Entity }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(current.name);
  const [newName, setNewName] = useState('');
  const [newFromStructure, setNewFromStructure] = useState(false);

  const documentsQuery = useGddDocuments(projectId, { includeArchived });
  const createDocument = useCreateGddDocument(projectId);
  const duplicateDocument = useDuplicateGddDocument(projectId);
  const renameDocument = useRenameGddDocument(projectId);
  const archiveDocument = useArchiveGddDocument(projectId);
  const restoreDocument = useRestoreGddDocument(projectId);

  const containerRef = useRef<HTMLDivElement>(null);
  // Enter and blur can both fire for the same commit — Enter's own state
  // update removes the input, and the browser blurs whatever is about to be
  // removed. Guards a stray second `updateEntity` call for the same rename.
  const renameCommittedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // The rename draft follows whichever document is open — reopening the
  // switcher on a different document must never offer to save the last one's
  // half-typed name onto this one.
  useEffect(() => {
    renameCommittedRef.current = true;
    setRenaming(false);
    setRenameValue(current.name);
  }, [current.id, current.name]);

  function openDocument(documentId: string) {
    setOpen(false);
    router.push(gddDocumentRoute(projectId, documentId) as Route);
  }

  function create() {
    const name = newName.trim();
    if (!name) return;
    createDocument.mutate(
      { name, startingStructure: newFromStructure },
      {
        onSuccess: (document) => {
          setNewName('');
          setNewFromStructure(false);
          openDocument(document.entity.id);
        },
      },
    );
  }

  function duplicate() {
    duplicateDocument.mutate(
      { documentId: current.id, name: `${current.name} (Copy)` },
      { onSuccess: (document) => openDocument(document.entity.id) },
    );
  }

  function commitRename() {
    if (renameCommittedRef.current) return;
    renameCommittedRef.current = true;
    setRenaming(false);

    const name = renameValue.trim();
    if (!name || name === current.name) {
      setRenameValue(current.name);
      return;
    }
    renameDocument.mutate({ documentId: current.id, name });
  }

  function startRenaming() {
    renameCommittedRef.current = false;
    setRenameValue(current.name);
    setRenaming(true);
  }

  function cancelRenaming() {
    renameCommittedRef.current = true;
    setRenaming(false);
    setRenameValue(current.name);
  }

  const archived = current.status === 'archived';
  const items = documentsQuery.data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="max-w-[220px] truncate">{current.name}</span>
        <ChevronDownIcon className="size-4" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Documents"
          className="absolute left-0 top-full z-20 mt-2 w-80 rounded-lg border border-border bg-raised p-2 shadow-[var(--lz-shadow-floating)]"
        >
          {documentsQuery.isPending && (
            <p className="px-2 py-1.5 text-xs text-faint-foreground">Loading documents…</p>
          )}

          {documentsQuery.isError && (
            <p className="px-2 py-1.5 text-xs text-error">
              {apiErrorMessage(documentsQuery.error, "Couldn't load the project's documents.")}
            </p>
          )}

          {documentsQuery.isSuccess && (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {items.map((document) => (
                <li key={document.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openDocument(document.id)}
                    aria-current={document.id === current.id}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm',
                      document.id === current.id
                        ? 'bg-active text-foreground'
                        : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                    )}
                  >
                    <span className="truncate">{document.name}</span>
                    {document.status === 'archived' && (
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint-foreground">
                        Archived
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {items.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-faint-foreground">No documents match.</p>
              )}
            </ul>
          )}

          <label className="mt-2 flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Checkbox
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Show archived
          </label>

          <div className="mt-2 flex flex-col gap-1.5 border-t border-border-subtle px-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">Current document</p>

            {renaming ? (
              <div className="flex gap-1.5">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === 'Escape') {
                      // Cancels the rename only. Left to bubble, this would
                      // also hit the popover's own Escape-closes handler and
                      // dismiss the whole switcher instead.
                      event.stopPropagation();
                      cancelRenaming();
                    }
                  }}
                  onBlur={commitRename}
                  aria-label="Document name"
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={archived}
                  onClick={startRenaming}
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={duplicateDocument.isPending}
                  onClick={duplicate}
                >
                  {duplicateDocument.isPending ? 'Duplicating…' : 'Duplicate'}
                </Button>
                {archived ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={restoreDocument.isPending}
                    onClick={() => restoreDocument.mutate(current.id)}
                  >
                    <HistoryIcon className="size-4" />
                    {restoreDocument.isPending ? 'Restoring…' : 'Restore'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={archiveDocument.isPending}
                    onClick={() => archiveDocument.mutate(current.id)}
                  >
                    {archiveDocument.isPending ? 'Archiving…' : 'Archive'}
                  </Button>
                )}
              </div>
            )}
            {archived && (
              <p className="text-[11px] text-faint-foreground">
                Restore this document to rename it.
              </p>
            )}
          </div>

          <form
            className="mt-2 flex flex-col gap-1.5 border-t border-border-subtle px-2 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New document"
                aria-label="New document name"
              />
              <Button
                type="submit"
                size="sm"
                disabled={createDocument.isPending || !newName.trim()}
              >
                {createDocument.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={newFromStructure}
                onChange={(event) => setNewFromStructure(event.target.checked)}
              />
              Start from the GDD structure
            </label>
          </form>
        </div>
      )}
    </div>
  );
}
