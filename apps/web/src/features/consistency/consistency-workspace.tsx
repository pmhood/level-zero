'use client';

import { type FindingStatus, type Job } from '@level-zero/domain';
import { Button, EmptyState, RefreshIcon, Tabs, WorkspacePage } from '@level-zero/ui';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { formatTimestamp, isScanActive, scanProgress, scanProgressLabel } from './consistency';
import { FindingList } from './finding-list';
import {
  useConsistencyScanStream,
  useFindings,
  useLatestConsistencyScan,
  useRequestConsistencyScan,
} from './use-findings';

type StatusTab = FindingStatus | 'all';

const TABS: { value: StatusTab; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const TAB_EMPTY_TITLES: Record<StatusTab, string> = {
  open: 'No open findings',
  dismissed: 'No dismissed findings',
  resolved: 'No resolved findings',
  all: 'No consistency findings',
};

/**
 * The project-level Consistency surface (issue #72, this issue's #112).
 *
 * Composes the design system's existing panel, status badge, tag, tabs and
 * empty-state primitives rather than a bespoke finding-list component — see
 * docs/decisions/consistency-findings.md §11, which is explicit that this
 * screen has no design spec of its own and should say so rather than invent
 * one unattended.
 *
 * "No scan has run yet" and "no findings" are deliberately different empty
 * states (the issue's own acceptance criterion): the first checks the job
 * history, the second checks whether any finding — in any status, not just
 * the tab in view — exists at all.
 */
export function ConsistencyWorkspace({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<StatusTab>('open');

  useConsistencyScanStream(projectId);
  const scanJobQuery = useLatestConsistencyScan(projectId);
  const requestScan = useRequestConsistencyScan(projectId);

  const findingsQuery = useFindings(projectId, {
    status: tab === 'all' ? undefined : [tab],
    limit: 100,
  });
  // Every status, unfiltered, just to know whether the project has found
  // anything at all — independent of which tab is currently in view.
  const everFindingsQuery = useFindings(projectId, { limit: 1 });

  const scanJob = scanJobQuery.data ?? null;
  const scanActive = isScanActive(scanJob);
  const hasEverScanned = scanJobQuery.isSuccess && scanJob !== null;
  const hasAnyFinding = (everFindingsQuery.data?.total ?? 0) > 0;
  const findings = findingsQuery.data?.items ?? [];

  const emptyState = hasEverScanned
    ? hasAnyFinding
      ? { title: TAB_EMPTY_TITLES[tab], description: 'Nothing in this view right now — try another tab.' }
      : {
          title: 'No consistency findings',
          description: 'The last scan found nothing to flag. Run it again after making changes.',
        }
    : {
        title: 'No scan has run yet',
        description:
          "Run analysis to check this project for contradictions a scan can prove — between prototypes, mechanics and documents.",
      };

  return (
    <WorkspacePage
      title="Consistency"
      description="What a scan can prove is out of sync in this project. Every finding links back to the canonical objects in tension — nothing here rewrites them."
      actions={
        <div className="flex flex-col items-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={scanActive || requestScan.isPending}
            onClick={() => requestScan.mutate()}
          >
            <RefreshIcon className="size-4" />
            {scanActive ? 'Scanning…' : 'Run analysis'}
          </Button>
          <ScanStatus job={scanJob} pending={scanJobQuery.isPending} />
        </div>
      }
      toolbar={<Tabs items={TABS} value={tab} onChange={(value) => setTab(value as StatusTab)} />}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 xl:px-5 2xl:px-6">
        {requestScan.isError && (
          <p className="text-xs text-error">
            {apiErrorMessage(requestScan.error, 'Could not start a scan.')}
          </p>
        )}

        {findingsQuery.isError ? (
          <EmptyState
            title="Couldn't read this project's findings"
            description={apiErrorMessage(findingsQuery.error)}
            actions={
              <Button variant="secondary" onClick={() => findingsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <FindingList
            projectId={projectId}
            findings={findings}
            emptyTitle={emptyState.title}
            emptyDescription={emptyState.description}
            emptyActions={
              !hasEverScanned ? (
                <Button
                  type="button"
                  disabled={scanActive || requestScan.isPending}
                  onClick={() => requestScan.mutate()}
                >
                  <RefreshIcon className="size-4" />
                  Run analysis
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </WorkspacePage>
  );
}

function ScanStatus({ job, pending }: { job: Job | null; pending: boolean }) {
  if (pending) return null;

  if (!job) {
    return <p className="text-xs text-faint-foreground">Never scanned</p>;
  }

  if (isScanActive(job)) {
    return <p className="text-xs text-muted-foreground">{scanProgressLabel(scanProgress(job))}</p>;
  }

  if (job.status === 'failed') {
    return (
      <p className="text-xs text-error">
        Last scan failed{job.failure ? `: ${job.failure.message}` : ''}
      </p>
    );
  }

  const at = job.completedAt ?? job.updatedAt;
  return <p className="text-xs text-faint-foreground">Last scanned {formatTimestamp(at)}</p>;
}
