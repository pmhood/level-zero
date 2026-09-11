'use client';

import type { Finding } from '@level-zero/domain';
import { EmptyState, Panel, type EmptyStateProps } from '@level-zero/ui';

import { FindingRow } from './finding-row';

export interface FindingListProps {
  projectId: string;
  findings: readonly Finding[];
  emptyTitle: string;
  emptyDescription?: string;
  emptyActions?: EmptyStateProps['actions'];
}

/**
 * The findings themselves: a bordered panel of rows, newest-seen first, or a
 * contextual empty state (design spec section 43 — never a bare "No data").
 * The caller decides what "empty" means here, because it reads differently
 * depending on whether a scan has ever run at all.
 */
export function FindingList({
  projectId,
  findings,
  emptyTitle,
  emptyDescription,
  emptyActions,
}: FindingListProps) {
  if (findings.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} actions={emptyActions} />;
  }

  return (
    <Panel className="divide-y divide-border-subtle overflow-hidden">
      {findings.map((finding) => (
        <FindingRow key={finding.id} projectId={projectId} finding={finding} />
      ))}
    </Panel>
  );
}
