'use client';

import type { OutcomeComparison, OutcomeSide, PrototypeVersion } from '@level-zero/domain';
import { Button, EmptyState, Field, SectionPanel, Select } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { OutcomeDesignChanges } from './outcome-design-changes';
import { OutcomeInterpretation } from './outcome-interpretation';
import { OutcomeMetricChanges } from './outcome-metric-changes';
import { feedbackEntries, observationEntries, OutcomeThemes } from './outcome-themes';
import { useOutcomeComparison } from './use-outcomes';

/**
 * `Changes vs Outcomes`: two prototype versions, what moved between them, and
 * what the playtests of each one found (UX spec, "Prototypes — Compare").
 *
 * The order is the argument. Design changes and measured results come first
 * and are stated as facts; the words people wrote come next, as their own
 * words; a model's reading comes last, asked for and labelled, so nothing on
 * this surface can be mistaken for a claim the evidence did not make. Nothing
 * here says a change caused an outcome, because two sets of playtests cannot
 * support that.
 */
export function ChangesVsOutcomes({
  projectId,
  prototypeId,
  versions,
  onOpenPlaytests,
}: {
  projectId: string;
  prototypeId: string;
  versions: readonly PrototypeVersion[];
  /** Opens the Playtests tab on one version — the way from a figure to its records. */
  onOpenPlaytests: (prototypeVersionId: string) => void;
}) {
  // Newest first, so B defaults to the latest version and A to the one before
  // it — "what changed and what happened", with nobody choosing anything.
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const a = versions.find((version) => version.id === aId) ?? versions[1];
  const b = versions.find((version) => version.id === bId) ?? versions[0];

  const comparison = useOutcomeComparison(projectId, prototypeId, a?.id ?? null, b?.id ?? null);

  if (versions.length < 2) {
    return (
      <EmptyState
        title="Nothing to correlate yet"
        description="Capture a second version and play it: this reads what changed in the design beside what the playtests of each version measured."
      />
    );
  }

  if (!a || !b) return null;

  return (
    <div className="flex flex-col gap-4">
      <VersionPickers
        versions={versions}
        a={a}
        b={b}
        onChangeA={setAId}
        onChangeB={setBId}
        onSwap={() => {
          setAId(b.id);
          setBId(a.id);
        }}
      />

      {comparison.isPending && (
        <p className="text-sm text-muted-foreground">Reading what changed and what happened…</p>
      )}
      {comparison.isError && (
        <p className="text-sm text-error">{apiErrorMessage(comparison.error)}</p>
      )}

      {comparison.data && (
        <Sections
          projectId={projectId}
          prototypeId={prototypeId}
          comparison={comparison.data}
          onOpenPlaytests={onOpenPlaytests}
        />
      )}
    </div>
  );
}

function Sections({
  projectId,
  prototypeId,
  comparison,
  onOpenPlaytests,
}: {
  projectId: string;
  prototypeId: string;
  comparison: OutcomeComparison;
  onOpenPlaytests: (prototypeVersionId: string) => void;
}) {
  const playtestNames = useMemo(
    () =>
      new Map(
        [...comparison.from.playtests, ...comparison.to.playtests].map((playtest) => [
          playtest.id,
          playtest.name,
        ]),
      ),
    [comparison],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Evidence label="A" side={comparison.from} onOpenPlaytests={onOpenPlaytests} />
        <Evidence label="B" side={comparison.to} onOpenPlaytests={onOpenPlaytests} />
      </div>

      <SectionPanel
        title="Design changes"
        description="What moved between the two versions, read from the entity versions each one pinned."
      >
        <OutcomeDesignChanges projectId={projectId} changes={comparison.designChanges} />
      </SectionPanel>

      <SectionPanel
        title="Metric changes"
        description="Measured during the playtests of each version. Means, with the sample behind them."
      >
        <OutcomeMetricChanges comparison={comparison} onOpenPlaytests={onOpenPlaytests} />
      </SectionPanel>

      <SectionPanel
        title="Feedback themes"
        description="What participants said, in their own words, grouped by the categories they were filed under."
      >
        <OutcomeThemes
          themes={feedbackEntries(comparison.feedbackThemes, playtestNames)}
          emptyTitle="No participant feedback yet"
          emptyDescription="Feedback recorded against a playtest of either version is grouped here by category."
        />
      </SectionPanel>

      <SectionPanel
        title="Observations"
        description="What the team noticed while watching — their reading of the run, not the participant's words."
      >
        <OutcomeThemes
          themes={observationEntries(comparison.observationThemes, playtestNames)}
          emptyTitle="No observations yet"
          emptyDescription="Observations recorded against a playtest of either version are grouped here by category."
        />
      </SectionPanel>

      <SectionPanel
        title="AI-assisted interpretation"
        description="A reading of everything above. Optional, labelled, and never part of the record."
      >
        <OutcomeInterpretation
          projectId={projectId}
          prototypeId={prototypeId}
          fromVersionId={comparison.from.version.id}
          toVersionId={comparison.to.version.id}
        />
      </SectionPanel>
    </div>
  );
}

/** What a side is: the version, and how much was actually played of it. */
function Evidence({
  label,
  side,
  onOpenPlaytests,
}: {
  label: 'A' | 'B';
  side: OutcomeSide;
  onOpenPlaytests: (prototypeVersionId: string) => void;
}) {
  const sessions = side.sessionCount === 1 ? '1 session' : `${side.sessionCount} sessions`;

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-faint-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">
          v{side.version.versionNumber}
          {side.version.name ? ` · ${side.version.name}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {side.playtests.length === 0
            ? 'No playtests recorded'
            : `${side.playtests.length === 1 ? '1 playtest' : `${side.playtests.length} playtests`}, ${sessions}`}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenPlaytests(side.version.id)}
      >
        Playtests
      </Button>
    </div>
  );
}

function VersionPickers({
  versions,
  a,
  b,
  onChangeA,
  onChangeB,
  onSwap,
}: {
  versions: readonly PrototypeVersion[];
  a: PrototypeVersion;
  b: PrototypeVersion;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  onSwap: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="A" htmlFor="outcomes-compare-a">
        <Select
          id="outcomes-compare-a"
          value={a.id}
          onChange={(event) => onChangeA(event.target.value)}
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.versionNumber}
              {version.name ? ` · ${version.name}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="B" htmlFor="outcomes-compare-b">
        <Select
          id="outcomes-compare-b"
          value={b.id}
          onChange={(event) => onChangeB(event.target.value)}
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.versionNumber}
              {version.name ? ` · ${version.name}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="button" variant="secondary" size="sm" onClick={onSwap}>
        Swap sides
      </Button>
    </div>
  );
}
