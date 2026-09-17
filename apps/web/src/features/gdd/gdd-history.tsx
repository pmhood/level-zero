'use client';

import type { DocumentContent, DocumentVersion } from '@level-zero/domain';
import {
  Button,
  Field,
  Input,
  RichTextEditor,
  SparklesIcon,
  StatusBadge,
  Tag,
  type JSONContent,
} from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { versionReasonLabel } from '@/features/entities/entity-presentation';
import { GenerationProvenanceDetails } from '@/features/generation/generation-provenance';
import { useGeneration } from '@/features/generation/use-generation';
import { apiErrorMessage } from '@/lib/api';

import {
  useGddDocumentHistory,
  useGddDocumentVersion,
  useRestoreGddDocumentVersion,
  useSnapshotGddDocument,
} from './use-gdd-documents';

/**
 * The GDD's version history (issue #184): every version newest first, one
 * read in place, entering the compare mode the workspace already has
 * (`EntityVersionCompare`), and a restore that appends rather than rewinds.
 * Autosave and `SaveStatusLabel` are untouched — this only adds the
 * deliberate acts a writer would recognise later.
 *
 * An archived document (#182) is read-only server-side, so naming a
 * snapshot or restoring a version is left off rather than offered and left
 * to fail — reading a version and comparing two is unaffected either way.
 */
export function GddHistory({
  projectId,
  documentId,
  archived,
  flush,
  onCompare,
  onRestored,
}: {
  projectId: string;
  documentId: string;
  archived: boolean;
  /** Lands whatever autosave is still holding before a snapshot or a restore. */
  flush: () => Promise<void>;
  /** Switches the workspace into the compare mode it already has. */
  onCompare: () => void;
  /** The restored version's body, so the editor can load it. */
  onRestored: (content: DocumentContent) => void;
}) {
  const history = useGddDocumentHistory(projectId, documentId);
  const snapshot = useSnapshotGddDocument(projectId, documentId);
  const restore = useRestoreGddDocumentVersion(projectId, documentId);

  const [name, setName] = useState('');
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleSnapshot(event: FormEvent) {
    event.preventDefault();
    try {
      // A version is of what the server holds, so whatever autosave is still
      // sitting on has to land before it is captured.
      await flush();
      await snapshot.mutateAsync({ name: name.trim() || undefined });
      setName('');
      setSnapshotError(null);
    } catch (error) {
      setSnapshotError(apiErrorMessage(error, 'Could not save a version.'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" size="sm" onClick={onCompare}>
        Compare versions
      </Button>

      {!archived && (
        <form
          onSubmit={(event) => void handleSnapshot(event)}
          className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised p-3"
        >
          <Field
            label="Save a version"
            htmlFor="gdd-history-snapshot-name"
            hint="Everything written so far, under a name you'll recognise later."
          >
            <Input
              id="gdd-history-snapshot-name"
              value={name}
              placeholder="Vertical slice review"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" size="sm" disabled={snapshot.isPending}>
              {snapshot.isPending ? 'Saving…' : 'Save a version'}
            </Button>
          </div>
          {snapshotError && <p className="text-xs text-error">{snapshotError}</p>}
        </form>
      )}

      {history.isPending && <p className="text-sm text-muted-foreground">Loading history…</p>}

      {history.isError && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-error">{apiErrorMessage(history.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {history.data && history.data.versions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No versions yet. Name and save one above to start the history.
        </p>
      )}

      {history.data && history.data.versions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {history.data.versions.map((version) => (
            <VersionRow
              key={version.id}
              projectId={projectId}
              documentId={documentId}
              archived={archived}
              version={version}
              expanded={expandedId === version.id}
              onToggleRead={() =>
                setExpandedId((current) => (current === version.id ? null : version.id))
              }
              restoring={restoringId === version.id}
              onStartRestore={() => setRestoringId(version.id)}
              onCancelRestore={() => setRestoringId(null)}
              restore={restore}
              flush={flush}
              onRestored={onRestored}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function VersionRow({
  projectId,
  documentId,
  archived,
  version,
  expanded,
  onToggleRead,
  restoring,
  onStartRestore,
  onCancelRestore,
  restore,
  flush,
  onRestored,
}: {
  projectId: string;
  documentId: string;
  archived: boolean;
  version: DocumentVersion;
  expanded: boolean;
  onToggleRead: () => void;
  restoring: boolean;
  onStartRestore: () => void;
  onCancelRestore: () => void;
  restore: ReturnType<typeof useRestoreGddDocumentVersion>;
  flush: () => Promise<void>;
  onRestored: (content: DocumentContent) => void;
}) {
  const [showGeneration, setShowGeneration] = useState(false);

  // The body is fetched to read it in place and, separately, to know what a
  // restore is about to bring back — one query covers both.
  const need = expanded || restoring;
  const versionQuery = useGddDocumentVersion(projectId, documentId, need ? version.id : null);

  async function confirmRestore() {
    if (!versionQuery.data) return;
    await flush();
    restore.mutate(version.id, {
      onSuccess: () => {
        onRestored(versionQuery.data.content);
        onCancelRestore();
      },
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            v{version.versionNumber} · {version.name ?? 'Unnamed version'}
          </p>
          <p className="text-xs text-faint-foreground">
            {versionReasonLabel(version.reason)} · {new Date(version.createdAt).toLocaleString()}
          </p>
        </div>
        {version.isCurrent && <StatusBadge tone="success">Current</StatusBadge>}
      </div>

      {version.reason === 'ai_edit' && (
        <Tag className="w-fit gap-1 border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground">
          <SparklesIcon className="size-3" />
          AI edit
        </Tag>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onToggleRead}>
          {expanded ? 'Hide' : 'Read'}
        </Button>

        {version.reason === 'ai_edit' && version.generationId && (
          <Button variant="ai" size="sm" onClick={() => setShowGeneration((current) => !current)}>
            <SparklesIcon className="size-4" />
            {showGeneration ? 'Hide the generation' : 'Show the generation'}
          </Button>
        )}

        {!archived && !version.isCurrent && (
          <Button variant="ghost" size="sm" disabled={restore.isPending} onClick={onStartRestore}>
            Restore
          </Button>
        )}
      </div>

      {showGeneration && version.generationId && (
        <AiEditGeneration projectId={projectId} generationId={version.generationId} />
      )}

      {expanded && (
        <VersionPreview query={versionQuery} label={`Version ${version.versionNumber}`} />
      )}

      {!archived && restoring && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface p-3">
          <p className="text-xs text-muted-foreground">
            Restoring brings this version&rsquo;s writing back as a new version. Nothing written
            since is lost — it stays reachable in the history above.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!versionQuery.data || restore.isPending}
              onClick={() => void confirmRestore()}
            >
              {restore.isPending ? 'Restoring…' : 'Restore this version'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={restore.isPending}
              onClick={onCancelRestore}
            >
              Cancel
            </Button>
          </div>
          {restore.isError && (
            <p className="text-xs text-error">
              {apiErrorMessage(restore.error, 'Could not restore that version.')}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** The AI generation an accepted edit came from — the same reveal every AI-assisted record offers. */
function AiEditGeneration({
  projectId,
  generationId,
}: {
  projectId: string;
  generationId: string;
}) {
  const generation = useGeneration(projectId, generationId);

  if (generation.isPending) {
    return <p className="text-xs text-faint-foreground">Reading the generation…</p>;
  }

  if (generation.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(generation.error, 'Could not read the generation.')}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] p-3">
      <GenerationProvenanceDetails projectId={projectId} generation={generation.data} />
    </div>
  );
}

function VersionPreview({
  query,
  label,
}: {
  query: ReturnType<typeof useGddDocumentVersion>;
  label: string;
}) {
  if (query.isPending) {
    return <p className="text-xs text-faint-foreground">Reading…</p>;
  }

  if (query.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(query.error, 'Could not read that version.')}
      </p>
    );
  }

  return (
    <div className="max-h-[360px] overflow-y-auto rounded-md border border-border-subtle p-2">
      <RichTextEditor
        mode="notes"
        editable={false}
        content={query.data.content as JSONContent}
        label={label}
      />
    </div>
  );
}
