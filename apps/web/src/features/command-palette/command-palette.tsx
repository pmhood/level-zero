'use client';

import type { SearchResult } from '@level-zero/domain';
import { Button, HistoryIcon, SearchField, SparklesIcon, cn } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { entityRoute } from '@/features/entity-detail/entity-route';
import { apiErrorMessage, searchProject } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { buildProjectCommands, matchesCommand, type PaletteCommand } from './command-palette-commands';
import { useRecentPaletteItems, type RecentPaletteItem } from './use-recent-palette-items';

type PaletteListEntry =
  | { kind: 'recent'; item: RecentPaletteItem }
  | { kind: 'command'; command: PaletteCommand }
  | { kind: 'result'; result: SearchResult };

interface PaletteSection {
  heading: string;
  entries: PaletteListEntry[];
}

function entryKey(entry: PaletteListEntry): string {
  switch (entry.kind) {
    case 'recent':
      return `recent:${entry.item.id}`;
    case 'command':
      return `command:${entry.command.id}`;
    case 'result':
      return `result:${entry.result.sourceType}:${entry.result.sourceId}`;
  }
}

/**
 * The global command palette (spec section 28): `⌘K`/`Ctrl+K` from any
 * project workspace, fuzzy-matched commands, live entity search, and a
 * distinct "Ask Level Zero" semantic mode.
 *
 * Mounted once by `ProjectShell`, so it is available from every workspace
 * without each of them wiring it up.
 */
export function CommandPalette({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="gap-2 text-muted-foreground"
      >
        <span className="hidden sm:inline">Search or jump to…</span>
        <kbd className="rounded border border-border-subtle bg-hover px-1.5 py-0.5 text-[11px] leading-none text-faint-foreground">
          ⌘K
        </kbd>
      </Button>
      {open && (
        <CommandPaletteDialog projectId={projectId} projectName={projectName} onClose={close} />
      )}
    </>
  );
}

function CommandPaletteDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const recent = useRecentPaletteItems(projectId);

  const commands = useMemo(() => buildProjectCommands(projectId), [projectId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  const debouncedQuery = useDebouncedValue(query, 250);
  const trimmedQuery = debouncedQuery.trim();

  // Reuses the same project-wide search API the Search workspace calls
  // (issue #68: "build on the existing project-wide search APIs rather than
  // creating a second search index") — scoped to entities, since those are
  // the only hits with a canonical route to open (docs/decisions/canonical-entity-routes.md).
  const searchQuery = useQuery({
    queryKey: ['projects', projectId, 'command-palette-search', mode, trimmedQuery],
    queryFn: () =>
      searchProject(projectId, { q: trimmedQuery, mode, sourceType: ['entity'], limit: 6 }),
    enabled: Boolean(projectId) && Boolean(trimmedQuery),
  });

  const searchResults = trimmedQuery ? (searchQuery.data?.items ?? []) : [];

  const sections = useMemo<PaletteSection[]>(() => {
    const built: PaletteSection[] = [];

    if (!query.trim() && recent.items.length > 0) {
      built.push({
        heading: 'Recent',
        entries: recent.items.map((item) => ({ kind: 'recent' as const, item })),
      });
    }

    const matchedByGroup = new Map<string, PaletteCommand[]>();
    for (const command of commands) {
      if (!matchesCommand(command, query)) continue;
      const group = matchedByGroup.get(command.group) ?? [];
      group.push(command);
      matchedByGroup.set(command.group, group);
    }
    for (const [heading, groupCommands] of matchedByGroup) {
      built.push({
        heading,
        entries: groupCommands.map((command) => ({ kind: 'command' as const, command })),
      });
    }

    if (trimmedQuery) {
      built.push({
        heading: mode === 'semantic' ? `Related to “${trimmedQuery}”` : 'Search results',
        entries: searchResults.map((result) => ({ kind: 'result' as const, result })),
      });
    }

    return built;
  }, [query, commands, trimmedQuery, mode, searchResults, recent.items]);

  const flatEntries = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const clampedIndex = flatEntries.length === 0 ? -1 : Math.min(selectedIndex, flatEntries.length - 1);

  function activate(entry: PaletteListEntry) {
    if (entry.kind === 'recent') {
      recent.record(entry.item);
      router.push(entry.item.href);
      onClose();
      return;
    }

    if (entry.kind === 'command') {
      if (entry.command.action.type === 'ask') {
        setMode('semantic');
        inputRef.current?.focus();
        return;
      }
      recent.record({
        id: entry.command.id,
        label: entry.command.label,
        description: entry.command.group,
        href: entry.command.action.href,
      });
      router.push(entry.command.action.href);
      onClose();
      return;
    }

    const href = entityRoute(projectId, entry.result.sourceId) as Route;
    recent.record({
      id: entry.result.sourceId,
      label: entry.result.title,
      description: entry.result.entityType ? entityTypeLabel(entry.result.entityType) : 'Entity',
      href,
    });
    router.push(href);
    onClose();
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flatEntries.length === 0) return;
      setSelectedIndex((index) => (index + 1) % flatEntries.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flatEntries.length === 0) return;
      setSelectedIndex((index) => (index - 1 + flatEntries.length) % flatEntries.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = flatEntries[clampedIndex];
      if (entry) activate(entry);
    }
  }

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Command palette — ${projectName}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-raised shadow-[var(--lz-shadow-floating)]"
      >
        <div className="flex items-center gap-2 border-b border-border-subtle p-2">
          <SearchField
            ref={inputRef}
            label="Search or run a command"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === 'semantic' ? 'Ask Level Zero about this project…' : 'Search or run a command…'
            }
            className="flex-1"
          />
          {mode === 'semantic' && (
            <button
              type="button"
              onClick={() => setMode('keyword')}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] px-2 py-1 text-xs text-ai-foreground"
            >
              <SparklesIcon className="size-3" />
              Ask Level Zero
              <span aria-hidden="true">&times;</span>
              <span className="sr-only">Exit Ask Level Zero mode</span>
            </button>
          )}
        </div>

        <div role="listbox" aria-label="Commands" className="flex-1 overflow-y-auto p-1.5">
          {flatEntries.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {trimmedQuery ? `No matches for “${trimmedQuery}”.` : 'No commands match.'}
            </p>
          )}

          {sections.map((section) => (
            <div key={section.heading} className="mb-1 last:mb-0">
              <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint-foreground uppercase">
                {section.heading}
              </p>
              {section.entries.map((entry) => {
                runningIndex += 1;
                const index = runningIndex;
                return (
                  <PaletteRow
                    key={entryKey(entry)}
                    entry={entry}
                    active={index === clampedIndex}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onSelect={() => activate(entry)}
                  />
                );
              })}
            </div>
          ))}

          {searchQuery.isError && (
            <p className="px-2.5 py-2 text-xs text-error">
              {apiErrorMessage(searchQuery.error, "Couldn't search this project.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  entry,
  active,
  onMouseEnter,
  onSelect,
}: {
  entry: PaletteListEntry;
  active: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  const isAi = entry.kind === 'command' && entry.command.kind === 'ai';

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm',
        active ? 'bg-hover text-foreground' : 'text-muted-foreground',
        isAi && 'text-ai-foreground',
      )}
    >
      {entry.kind === 'recent' && <HistoryIcon className="size-4 shrink-0 text-faint-foreground" />}
      {entry.kind === 'command' && isAi && <SparklesIcon className="size-4 shrink-0" />}

      <span className="min-w-0 flex-1 truncate">
        {entry.kind === 'recent' && entry.item.label}
        {entry.kind === 'command' && entry.command.label}
        {entry.kind === 'result' && entry.result.title}
      </span>

      {entry.kind === 'recent' && (
        <span className="shrink-0 truncate text-xs text-faint-foreground">{entry.item.description}</span>
      )}
      {entry.kind === 'result' && (
        <span className="shrink-0 truncate text-xs text-faint-foreground">
          {entry.result.entityType ? entityTypeLabel(entry.result.entityType) : 'Entity'}
        </span>
      )}
    </button>
  );
}
