'use client';

import {
  DEFAULT_BRANCH,
  documentContent,
  entityVersionDifferences,
  readParameters,
  type Entity,
  type EntitySnapshot,
  type EntityVersion,
} from '@level-zero/domain';
import {
  Button,
  CompareView,
  EmptyState,
  Field,
  Input,
  ParameterSummary,
  RichTextEditor,
  Select,
  StatusBadge,
  Tag,
  type CompareSide,
  type JSONContent,
} from '@level-zero/ui';
import { useMemo, useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { entityStatusBadge, versionReasonLabel } from './entity-presentation';
import {
  useBranchEntityVersion,
  useEntityHistory,
  useRestoreEntityVersion,
} from './use-entity-versions';

/**
 * Two versions of one entity, side by side (spec section 61).
 *
 * This is the whole of compare mode for everything the entity model holds — a
 * character, a location, a mechanic, a design document — because a version is
 * a version whatever it is a version of. What separates a mechanic from a
 * document is which `data` fields it carries, and the domain reads those into
 * differences; here they are only laid out.
 *
 * Nothing is written until somebody presses Restore or starts a new line of
 * work, and both of those *add* a version: the history either side of them
 * survives untouched.
 */
export function EntityVersionCompare({ projectId, entity }: { projectId: string; entity: Entity }) {
  const history = useEntityHistory(projectId, entity.id);

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">Loading versions…</p>;
  }

  if (history.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{apiErrorMessage(history.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (history.data.versions.length < 2) {
    return (
      <EmptyState
        title="Nothing to compare yet"
        description="Save a second version and this shows what moved between them — names, tags, tuning and writing."
      />
    );
  }

  return (
    <VersionComparison
      projectId={projectId}
      entity={entity}
      versions={history.data.versions}
      currentVersionId={history.data.currentVersionId}
    />
  );
}

function VersionComparison({
  projectId,
  entity,
  versions,
  currentVersionId,
}: {
  projectId: string;
  entity: Entity;
  versions: EntityVersion[];
  currentVersionId: string | null;
}) {
  // Newest first, so B defaults to where the entity is now and A to the point
  // just before it — "what changed last" without anybody choosing anything.
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [startingFrom, setStartingFrom] = useState<EntityVersion | null>(null);
  const [lineName, setLineName] = useState('');

  const restore = useRestoreEntityVersion(projectId);
  const branch = useBranchEntityVersion(projectId);

  const a = versions.find((version) => version.id === aId) ?? versions[1];
  const b = versions.find((version) => version.id === bId) ?? versions[0];

  const groups = useMemo(
    () => (a && b ? entityVersionDifferences(a.snapshot, b.snapshot) : []),
    [a, b],
  );

  if (!a || !b) return null;

  const archived = entity.status === 'archived';

  function startLine(event: FormEvent) {
    event.preventDefault();
    if (!startingFrom || lineName.trim().length === 0) return;

    branch.mutate(
      { entityId: entity.id, versionId: startingFrom.id, branchName: lineName.trim() },
      {
        onSuccess: () => {
          setStartingFrom(null);
          setLineName('');
        },
      },
    );
  }

  const side = (version: EntityVersion): CompareSide => ({
    label: versionLabel(version),
    meta: versionMeta(version),
    current: version.id === currentVersionId,
    children: (
      <VersionPane key={version.id} snapshot={version.snapshot} label={versionLabel(version)} />
    ),
    actions: archived ? null : (
      <>
        {version.id !== currentVersionId && (
          <Button
            variant="secondary"
            size="sm"
            disabled={restore.isPending}
            onClick={() => restore.mutate({ entityId: entity.id, versionId: version.id })}
          >
            Restore this version
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStartingFrom(version);
            setLineName('');
          }}
        >
          Start a new line of work
        </Button>
      </>
    ),
  });

  return (
    <div className="flex flex-col gap-3">
      <CompareView
        a={side(a)}
        b={side(b)}
        groups={groups}
        sameLabel="Nothing moved between these two versions."
        toolbar={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="A" htmlFor="compare-side-a">
                <Select
                  id="compare-side-a"
                  value={a.id}
                  onChange={(event) => setAId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {versionOption(version)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="B" htmlFor="compare-side-b">
                <Select
                  id="compare-side-b"
                  value={b.id}
                  onChange={(event) => setBId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {versionOption(version)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAId(b.id);
                  setBId(a.id);
                }}
              >
                Swap sides
              </Button>
            </div>

            {startingFrom && (
              <form
                onSubmit={startLine}
                className="flex flex-wrap items-end gap-2 rounded-md border border-border-subtle bg-raised p-3"
              >
                <Field
                  label={`Name this line of work, starting from ${versionLabel(startingFrom)}`}
                  htmlFor="compare-line-name"
                  hint="The version you start from stays exactly where it is."
                >
                  <Input
                    id="compare-line-name"
                    value={lineName}
                    placeholder="Rugged"
                    onChange={(event) => setLineName(event.target.value)}
                  />
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  disabled={lineName.trim().length === 0 || branch.isPending}
                >
                  {branch.isPending ? 'Starting…' : 'Start'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStartingFrom(null)}
                >
                  Cancel
                </Button>
              </form>
            )}
          </div>
        }
      />

      {archived && (
        <p className="text-xs text-faint-foreground">
          Restore this {entity.type === 'document' ? 'document' : 'entity'} before changing its
          versions. Comparing them is always safe.
        </p>
      )}
      {restore.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(restore.error, 'Could not restore that version.')}
        </p>
      )}
      {branch.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(branch.error, 'Could not start that line of work.')}
        </p>
      )}
    </div>
  );
}

/**
 * One version's content, showing whatever that version actually holds.
 *
 * Tuning and prose are read out of `data` rather than switched on the entity
 * type, so a mechanic shows its parameters and a document its writing without
 * this component knowing what either of those is. The body goes through the
 * one editor, read only — never rendered from its stored JSON by hand.
 */
function VersionPane({ snapshot, label }: { snapshot: EntitySnapshot; label: string }) {
  const badge = entityStatusBadge(snapshot.status);
  const parameters = readParameters(snapshot);
  const content = documentContent(snapshot);
  const hasWriting = Array.isArray(content.content) && content.content.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm font-medium text-foreground">{snapshot.name}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {snapshot.tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {snapshot.description ?? 'No summary at this version.'}
      </p>

      {parameters.length > 0 && <ParameterSummary parameters={parameters} />}

      {hasWriting && (
        <div className="max-h-[420px] overflow-y-auto">
          <RichTextEditor
            mode="notes"
            editable={false}
            content={content as JSONContent}
            label={label}
          />
        </div>
      )}
    </div>
  );
}

function versionLabel(version: EntityVersion): string {
  return `v${version.versionNumber}`;
}

function versionMeta(version: EntityVersion): string {
  const parts = [versionReasonLabel(version.reason)];
  if (version.branchName !== DEFAULT_BRANCH) parts.push(version.branchName);
  parts.push(new Date(version.createdAt).toLocaleDateString());
  return parts.join(' · ');
}

function versionOption(version: EntityVersion): string {
  return `${versionLabel(version)} · ${versionMeta(version)}`;
}
