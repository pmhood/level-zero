'use client';

import {
  Button,
  CloseIcon,
  Input,
  SearchIcon,
  useFindInDocument,
  type Editor,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * Find-in-document (#191): a field over the live editor, not a second search
 * — matches are counted and stepped through with `FindInDocument`'s own
 * decoration pass (`useFindInDocument`), which walks the loaded document
 * rather than the rendered DOM, so a match scrolled well out of view is found
 * and reached exactly like one on screen.
 *
 * "Search all documents" is the way into #41's project search this issue
 * asks for — pre-scoped to documents (`?scope=document`, the same seeding
 * `SearchWorkspace` already reads for `sourceType`) rather than a second
 * index or a second result list living in here.
 */
export function GddFindBar({
  projectId,
  editor,
  onClose,
}: {
  projectId: string;
  editor: Editor | null;
  onClose: () => void;
}) {
  const find = useFindInDocument(editor);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) find.previous();
      else find.next();
    }
  }

  const trimmed = find.query.trim();
  const status = !trimmed
    ? null
    : find.matchCount > 0
      ? `${find.activeMatchNumber} of ${find.matchCount}`
      : 'No matches';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
      <SearchIcon className="size-4 shrink-0 text-faint-foreground" />
      <Input
        ref={inputRef}
        value={find.query}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in this document…"
        aria-label="Find in this document"
        className="h-8 w-full max-w-[220px]"
      />
      <span className="min-w-[5.5rem] text-xs text-muted-foreground" aria-live="polite">
        {status}
      </span>
      <Button variant="ghost" size="sm" onClick={find.previous} disabled={find.matchCount === 0}>
        Previous
      </Button>
      <Button variant="ghost" size="sm" onClick={find.next} disabled={find.matchCount === 0}>
        Next
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/projects/${projectId}/search?scope=document` as Route}>
          Search all documents
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        aria-label="Close find"
        className="ml-auto"
      >
        <CloseIcon className="size-4" />
      </Button>
    </div>
  );
}
